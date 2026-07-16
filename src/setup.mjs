#!/usr/bin/env node

import { confirm, input, password, select } from "@inquirer/prompts";
import { ConfigError, readPluginEnv, resolveConfig } from "./config.mjs";
import {
  DEFAULT_KEY_PREFIX,
  MAX_PRESIGN_EXPIRY_SECONDS,
} from "./config-schema.mjs";
import { CONFIGURE_ACTION_ID, PLUGIN_ID } from "./plugin-metadata.mjs";
import { checkBucketAccess } from "./s3-upload.mjs";
import {
  buildSetupEnv,
  providerFieldDefault,
  PROVIDER_PRESETS,
  setupInitialValues,
  validateEndpointInput,
  validatePublicBaseUrlInput,
  writeSetupEnv,
} from "./setup-config.mjs";
import { resolveSetupConfigDir } from "./setup-context.mjs";
import { formatProviderGuide, getProviderGuide, STORAGE_PROVIDER_CHOICES } from "./provider-guides.mjs";
import { configureUploadKeybinding } from "./setup-keybinding.mjs";

const PROVIDERS = [
  { name: "AWS S3", value: "aws", description: "Use AWS endpoint discovery from the selected region." },
  { name: "Cloudflare R2", value: "r2", description: "Use the account-scoped R2 S3 API endpoint." },
  { name: "MinIO", value: "minio", description: "Use a custom endpoint with path-style requests." },
  { name: "Other S3-compatible service", value: "generic", description: "Configure endpoint, region, and request style manually." },
];

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args.length > 0 && (args.length !== 1 || args[0] !== "setup")) {
    throw new Error(`Unknown arguments: ${args.join(" ")}. Run with --help for usage.`);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive setup requires a terminal (TTY).");
  }

  const configDir = resolveSetupConfigDir();

  const fileEnv = await readPluginEnv(configDir);
  const existing = setupInitialValues(fileEnv);
  const hasExistingConfig = Object.keys(fileEnv).length > 0;

  process.stdout.write("\nHerdr S3 Image Publisher setup\n\n");
  if (hasExistingConfig) {
    process.stdout.write(`Existing ${existing.sourceNamespace} values were loaded. Secret values remain hidden.\n\n`);
  }

  const storageStatus = await select({
    message: "S3-compatible storage",
    choices: [
      { name: "I already have a bucket and access credentials", value: "ready" },
      { name: "Help me choose and set up a provider", value: "needs-provider" },
    ],
    default: hasExistingConfig ? "ready" : "needs-provider",
  });

  let provider;
  let providerOverrides = {};
  let formDefaults = existing;

  if (storageStatus === "needs-provider") {
    const providerId = await select({
      message: "Storage provider",
      choices: STORAGE_PROVIDER_CHOICES,
      default: "r2",
    });
    const guide = getProviderGuide(providerId);
    process.stdout.write(formatProviderGuide(providerId));

    const nextStep = await select({
      message: "Provider setup status",
      choices: [
        { name: "Continue setup - I created the bucket and saved its credentials", value: "continue" },
        { name: "Exit - I will finish provider setup later", value: "exit" },
      ],
      default: "exit",
    });
    if (nextStep === "exit") {
      process.stdout.write("\nSetup paused. No configuration was changed. Run the wizard again when your bucket and credentials are ready.\n");
      return;
    }

    provider = guide.setupProvider;
    providerOverrides = guide.defaults;
    formDefaults = { ...setupInitialValues({}), provider: "new-provider" };
  } else {
    provider = await select({
      message: "S3 provider",
      choices: PROVIDERS,
      default: existing.provider,
    });
  }

  const preset = { ...PROVIDER_PRESETS[provider], ...providerOverrides };

  const accountId = provider === "r2"
    ? await requiredInput("Cloudflare account ID", formDefaults.accountId)
    : provider === "generic"
      ? await input({ message: "Account ID (optional)", default: formDefaults.accountId || "" })
      : "";

  const endpoint = provider === "aws"
    ? ""
    : await requiredInput(
      "S3 endpoint",
      providerFieldDefault(formDefaults, provider, "endpoint", providerOverrides),
      (value) => validateEndpointInput(value, accountId),
    );
  const region = await requiredInput("S3 region", providerFieldDefault(formDefaults, provider, "region", providerOverrides));
  const bucket = await requiredInput("Bucket name", formDefaults.bucket);
  const accessKeyId = await requiredInput("Access key ID", formDefaults.accessKeyId);
  const secretAccessKey = await secretInput("Secret access key", formDefaults.secretAccessKey);
  const useSessionToken = await confirm({
    message: formDefaults.sessionToken ? "Keep using the existing session token?" : "Use a temporary session token?",
    default: Boolean(formDefaults.sessionToken),
  });
  const sessionToken = useSessionToken
    ? await secretInput("Session token", formDefaults.sessionToken)
    : "";

  const urlMode = await select({
    message: "URL mode",
    choices: [
      { name: "Presigned URL (private bucket)", value: "presigned" },
      { name: "Public URL or CDN", value: "public" },
    ],
    default: formDefaults.urlMode || "presigned",
  });
  const presignExpiresIn = urlMode === "presigned"
    ? await input({
      message: "Presigned URL lifetime in seconds",
      default: formDefaults.presignExpiresIn || String(MAX_PRESIGN_EXPIRY_SECONDS),
      validate: validateExpiry,
    })
    : "";
  const publicBaseUrl = urlMode === "public"
    ? await requiredInput("Public base URL", formDefaults.publicBaseUrl, validatePublicBaseUrlInput)
    : "";

  const configureAdvanced = await confirm({ message: "Configure advanced upload options?", default: false });
  const forcePathStyle = configureAdvanced
    ? await confirm({
      message: "Force path-style S3 requests?",
      default: formDefaults.forcePathStyle
        ? formDefaults.forcePathStyle.toLowerCase() === "true"
        : preset.forcePathStyle,
    })
    : (formDefaults.forcePathStyle
      ? formDefaults.forcePathStyle.toLowerCase() === "true"
      : preset.forcePathStyle);
  const keyPrefix = configureAdvanced
    ? await input({ message: "Object key prefix", default: formDefaults.keyPrefix || DEFAULT_KEY_PREFIX })
    : formDefaults.keyPrefix || DEFAULT_KEY_PREFIX;
  const cacheControl = configureAdvanced
    ? await input({ message: "Cache-Control metadata (optional)", default: formDefaults.cacheControl || "" })
    : formDefaults.cacheControl || "";
  const autoSubmit = configureAdvanced
    ? await confirm({ message: "Press Enter after inserting the URL?", default: formDefaults.autoSubmit === "true" })
    : formDefaults.autoSubmit === "true";

  const values = buildSetupEnv({
    accountId,
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    publicBaseUrl,
    urlMode,
    presignExpiresIn,
    keyPrefix,
    forcePathStyle,
    cacheControl,
    autoSubmit,
  });
  const resolved = resolveConfig({ env: {}, fileEnv: values });

  if (await confirm({ message: "Test bucket access before saving?", default: true })) {
    process.stdout.write("Testing bucket access...\n");
    try {
      await checkBucketAccess(resolved);
      process.stdout.write("Bucket access succeeded.\n");
    } catch (error) {
      process.stderr.write(`Bucket access failed: ${connectionErrorMessage(error, resolved)}\n`);
      const saveAnyway = await confirm({ message: "Save this configuration anyway?", default: false });
      if (!saveAnyway) {
        process.stdout.write("Configuration was not changed.\n");
        return;
      }
    }
  }

  const save = await confirm({
    message: hasExistingConfig ? "Replace the existing plugin configuration?" : "Save this configuration?",
    default: true,
  });
  if (!save) {
    process.stdout.write("Configuration was not changed.\n");
    return;
  }

  const path = await writeSetupEnv({ configDir, values });
  process.stdout.write(`\nConfiguration saved to ${path}.\nSecrets were not printed.\n\n`);
  try {
    await configureUploadKeybinding({
      confirmPrompt: confirm,
      inputPrompt: input,
      selectPrompt: select,
    });
  } catch (error) {
    if (error?.name !== "ExitPromptError") throw error;
    process.stderr.write("\nKeybinding setup cancelled. Storage configuration remains saved.\n");
    process.exitCode = 130;
    return;
  }
  process.stdout.write("Setup complete. You can now use the upload action.\n");
}

function printHelp() {
  process.stdout.write(`Herdr S3 Image Publisher setup

Usage:
  herdr-s3-clipboard [setup]
  npm run setup

Runs the interactive setup wizard in the current terminal. The wizard uses
HERDR_PLUGIN_CONFIG_DIR when Herdr provides it; otherwise it discovers the same
directory with: herdr plugin config-dir ${PLUGIN_ID}

To open the wizard as an overlay in a running Herdr session instead:
  herdr plugin action invoke ${CONFIGURE_ACTION_ID}
`);
}

async function requiredInput(message, defaultValue = "", validateValue) {
  return input({
    message,
    default: defaultValue || undefined,
    validate: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return `${message} is required.`;
      return validateValue ? validateValue(trimmed) : true;
    },
  });
}

async function secretInput(message, existingValue = "", required = true) {
  const suffix = existingValue ? " (leave blank to keep existing)" : "";
  const value = await password({
    message: `${message}${suffix}`,
    mask: "*",
    validate: (candidate) => !required || candidate.length > 0 || existingValue.length > 0 || `${message} is required.`,
  });
  return value || existingValue;
}

function validateExpiry(value) {
  const validationMessage = `Enter an integer from 1 to ${MAX_PRESIGN_EXPIRY_SECONDS}.`;
  if (!/^\d+$/.test(value)) return validationMessage;
  const seconds = Number(value);
  return (seconds >= 1 && seconds <= MAX_PRESIGN_EXPIRY_SECONDS) || validationMessage;
}

function connectionErrorMessage(error, config) {
  const status = error?.$metadata?.httpStatusCode;
  const name = error?.name && error.name !== "Error" ? error.name : "S3 request failed";
  const message = error?.message ? `: ${error.message}` : "";
  let result = `${name}${status ? ` (HTTP ${status})` : ""}${message}`;
  for (const credential of [config.accessKeyId, config.secretAccessKey, config.sessionToken]) {
    if (credential) result = result.replaceAll(credential, "[redacted]");
  }
  return result;
}

try {
  await main();
} catch (error) {
  if (error?.name === "ExitPromptError") {
    process.stderr.write("\nSetup cancelled; configuration was not changed.\n");
    process.exitCode = 130;
  } else {
    const prefix = error instanceof ConfigError ? "Configuration error" : "Setup failed";
    process.stderr.write(`${prefix}: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}
