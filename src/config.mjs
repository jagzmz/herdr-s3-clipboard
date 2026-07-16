import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AUTO_SUBMIT_KEY,
  CONFIG_FILENAME,
  DEFAULT_KEY_PREFIX,
  DEFAULT_S3_REGION,
  DEFAULT_URL_MODE,
  HSC_S3_KEYS,
  HSC_S3_NAMESPACE,
  HSC_S3_PREFIX,
  MAX_PRESIGN_EXPIRY_SECONDS,
  REQUIRED_CONFIG_FIELDS,
  S3_KEYS,
  S3_NAMESPACE,
} from "./config-schema.mjs";

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parse a deliberately small, dotenv-compatible subset. It supports comments,
 * quoted values, and `export KEY=value`, which is enough for a user-managed
 * plugin config file without another runtime dependency.
 */
export function parseEnvFile(contents) {
  const values = {};

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      throw new ConfigError(`Invalid .env entry on line ${index + 1}.`);
    }

    const [, key, rawValue] = match;
    values[key] = parseEnvValue(rawValue, index + 1);
  }

  return values;
}

function parseEnvValue(rawValue, lineNumber) {
  const value = rawValue.trim();
  if (!value) return "";

  const quote = value[0];
  if (quote === "\"" || quote === "'") {
    if (value.length < 2 || value.at(-1) !== quote) {
      throw new ConfigError(`Unterminated quoted value on line ${lineNumber}.`);
    }

    const unquoted = value.slice(1, -1);
    return quote === "\"" ? decodeDoubleQuotedValue(unquoted) : unquoted;
  }

  return value.replace(/\s+#.*$/, "").trim();
}

function decodeDoubleQuotedValue(value) {
  const escapes = { n: "\n", r: "\r", t: "\t", "\"": "\"", "\\": "\\" };
  return value.replace(/\\([nrt"\\])/g, (_, character) => escapes[character]);
}

export async function loadConfig({ env = process.env, configDir = env.HERDR_PLUGIN_CONFIG_DIR } = {}) {
  const fileEnv = await readPluginEnv(configDir);
  return resolveConfig({ env, fileEnv });
}

export async function readPluginEnv(configDir) {
  if (!configDir) return {};

  try {
    return parseEnvFile(await readFile(join(configDir, CONFIG_FILENAME), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

/**
 * A namespace is selected once, across process env and the plugin .env file.
 * The HSC namespace is intentionally atomic: seeing even one HSC_S3_* setting
 * means generic S3_* values are ignored completely. This prevents accidental
 * credential/configuration mixing when a migration is only partly completed.
 */
export function resolveConfig({ env = {}, fileEnv = {} } = {}) {
  const useHscNamespace = hasAnyHscValue(env, fileEnv);
  const keys = useHscNamespace ? HSC_S3_KEYS : S3_KEYS;
  const namespace = useHscNamespace ? HSC_S3_NAMESPACE : S3_NAMESPACE;
  const values = {};

  for (const [field, key] of Object.entries(keys)) {
    values[field] = valueFromSources(key, env, fileEnv);
  }

  const urlMode = parseUrlMode(values.urlMode, keys.urlMode);
  const requiredFields = urlMode === "public"
    ? [...REQUIRED_CONFIG_FIELDS, "publicBaseUrl"]
    : REQUIRED_CONFIG_FIELDS;
  const missingFields = requiredFields.filter((field) => !values[field]);
  if (missingFields.length > 0) {
    const missingKeys = missingFields.map((field) => keys[field]).join(", ");
    const genericWarning = useHscNamespace
      ? " S3_* values were ignored because at least one HSC_S3_* value is set."
      : "";
    throw new ConfigError(`Incomplete ${namespace} configuration; missing ${missingKeys}.${genericWarning}`);
  }

  const endpoint = normalizeS3Endpoint(values.endpoint, values.accountId, keys.endpoint, keys.accountId);

  return {
    namespace,
    accountId: values.accountId,
    endpoint,
    region: values.region || DEFAULT_S3_REGION,
    bucket: values.bucket,
    accessKeyId: values.accessKeyId,
    secretAccessKey: values.secretAccessKey,
    sessionToken: values.sessionToken,
    urlMode,
    publicBaseUrl: values.publicBaseUrl
      ? normalizePublicBaseUrl(values.publicBaseUrl, keys.publicBaseUrl)
      : undefined,
    presignExpiresIn: parsePresignExpiry(values.presignExpiresIn, keys.presignExpiresIn),
    keyPrefix: normalizeKeyPrefix(values.keyPrefix || DEFAULT_KEY_PREFIX, keys.keyPrefix),
    forcePathStyle: parseBoolean(values.forcePathStyle, keys.forcePathStyle, false),
    cacheControl: values.cacheControl,
    autoSubmit: parseBoolean(valueFromSources(AUTO_SUBMIT_KEY, env, fileEnv), AUTO_SUBMIT_KEY, false),
  };
}

function hasAnyHscValue(env, fileEnv) {
  return [env, fileEnv].some((source) => Object.keys(source).some((key) => key.startsWith(HSC_S3_PREFIX)));
}

function valueFromSources(key, env, fileEnv) {
  return readValue(env[key]) ?? readValue(fileEnv[key]);
}

function readValue(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeS3Endpoint(rawEndpoint, accountId, endpointKey, accountIdKey) {
  if (!rawEndpoint) return undefined;

  if (rawEndpoint.includes("{accountId}")) {
    if (!accountId) {
      throw new ConfigError(`${endpointKey} uses {accountId}, but ${accountIdKey} is not set.`);
    }
    rawEndpoint = rawEndpoint.replaceAll("{accountId}", encodeURIComponent(accountId));
  }

  const url = parseHttpUrl(rawEndpoint, endpointKey);
  if (url.search || url.hash) {
    throw new ConfigError(`${endpointKey} must not contain a query string or fragment.`);
  }

  return url.toString().replace(/\/$/, "");
}

export function normalizePublicBaseUrl(rawUrl, key) {
  const url = parseHttpUrl(rawUrl, key);
  if (url.search || url.hash) {
    throw new ConfigError(`${key} must not contain a query string or fragment.`);
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function parseHttpUrl(rawUrl, key) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError(`${key} must be a valid HTTP(S) URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigError(`${key} must use http:// or https://.`);
  }
  if (url.username || url.password) {
    throw new ConfigError(`${key} must not contain embedded credentials.`);
  }
  return url;
}

function normalizeKeyPrefix(value, key) {
  const prefix = value.replace(/^\/+|\/+$/g, "");
  if (!prefix) return "";

  if (prefix.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new ConfigError(`${key} cannot contain empty, . or .. path segments.`);
  }

  return prefix;
}

function parseBoolean(rawValue, key, fallback) {
  if (!rawValue) return fallback;

  const value = rawValue.toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new ConfigError(`${key} must be true or false.`);
}

function parseUrlMode(rawValue, key) {
  const value = rawValue?.toLowerCase() || DEFAULT_URL_MODE;
  if (value === "public" || value === "presigned") return value;
  throw new ConfigError(`${key} must be public or presigned.`);
}

function parsePresignExpiry(rawValue, key) {
  if (!rawValue) return MAX_PRESIGN_EXPIRY_SECONDS;
  if (!/^\d+$/.test(rawValue)) {
    throw new ConfigError(`${key} must be an integer from 1 to ${MAX_PRESIGN_EXPIRY_SECONDS}.`);
  }

  const value = Number(rawValue);
  if (value < 1 || value > MAX_PRESIGN_EXPIRY_SECONDS) {
    throw new ConfigError(`${key} must be an integer from 1 to ${MAX_PRESIGN_EXPIRY_SECONDS}.`);
  }
  return value;
}
