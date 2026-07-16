import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseEnvFile, resolveConfig } from "../src/config.mjs";
import {
  buildSetupEnv,
  providerFieldDefault,
  serializeSetupEnv,
  setupInitialValues,
  validateEndpointInput,
  validatePublicBaseUrlInput,
  writeSetupEnv,
} from "../src/setup-config.mjs";

test("new configurations use provider defaults even when provider inference matches", () => {
  const existing = setupInitialValues({});

  assert.equal(existing.provider, "aws");
  assert.equal(providerFieldDefault(existing, "aws", "region"), "us-east-1");
  assert.equal(providerFieldDefault(existing, "r2", "region"), "auto");
  assert.equal(
    providerFieldDefault(existing, "r2", "endpoint"),
    "https://{accountId}.r2.cloudflarestorage.com",
  );
  assert.equal(providerFieldDefault(existing, "generic", "region", { region: "" }), "");
});

test("provider defaults reject unknown providers and fields", () => {
  const existing = setupInitialValues({});

  assert.throws(
    () => providerFieldDefault(existing, "unknown", "region"),
    /Unknown S3 provider: unknown/,
  );
  assert.throws(
    () => providerFieldDefault(existing, "aws", "unknown"),
    /Unknown aws provider field: unknown/,
  );
});

test("setup validates endpoint URLs before leaving the field", () => {
  assert.equal(
    validateEndpointInput("https://{accountId}.r2.cloudflarestorage.com", "account-123"),
    true,
  );
  assert.match(
    validateEndpointInput("s3.provider.example", ""),
    /must be a valid HTTP\(S\) URL.*https:\/\/s3\.provider\.example/,
  );
  assert.match(
    validateEndpointInput("https://s3.provider.example?bucket=images", ""),
    /must not contain a query string or fragment/,
  );
});

test("setup validates public base URLs before leaving the field", () => {
  assert.equal(validatePublicBaseUrlInput("https://img.example.com"), true);
  assert.match(
    validatePublicBaseUrlInput("public-uploads.example.com"),
    /must be a valid HTTP\(S\) URL.*https:\/\/img\.example\.com/,
  );
  assert.match(
    validatePublicBaseUrlInput("ftp://img.example.com"),
    /must use http:\/\/ or https:\/\//,
  );
});

test("setup never merges partial HSC values with generic S3 values", () => {
  const values = setupInitialValues({
    HSC_S3_BUCKET: "hsc-bucket",
    S3_ACCESS_KEY_ID: "generic-access",
    S3_SECRET_ACCESS_KEY: "generic-secret",
  });

  assert.equal(values.sourceNamespace, "HSC_S3_*");
  assert.equal(values.bucket, "hsc-bucket");
  assert.equal(values.accessKeyId, "");
  assert.equal(values.secretAccessKey, "");
});

test("setup can import generic S3 values when HSC is absent", () => {
  const values = setupInitialValues({
    S3_BUCKET: "generic-bucket",
    S3_ACCESS_KEY_ID: "generic-access",
    S3_SECRET_ACCESS_KEY: "generic-secret",
  });

  assert.equal(values.sourceNamespace, "S3_*");
  assert.equal(values.bucket, "generic-bucket");
  assert.equal(values.accessKeyId, "generic-access");
  assert.equal(values.secretAccessKey, "generic-secret");
});

test("serialized setup values round trip special characters without exposing generic keys", () => {
  const values = buildSetupEnv({
    bucket: "clipboard-images",
    accessKeyId: "access-id",
    secretAccessKey: "a secret \\\\n with \"quotes\"",
    region: "us-east-1",
    urlMode: "presigned",
    presignExpiresIn: "604800",
    keyPrefix: "images",
    forcePathStyle: false,
    autoSubmit: false,
  });
  const serialized = serializeSetupEnv(values);
  const parsed = parseEnvFile(serialized);

  assert.deepEqual(parsed, values);
  assert.doesNotMatch(serialized, /^S3_/m);
  assert.doesNotMatch(serialized, /generic-secret/);
  assert.doesNotThrow(() => resolveConfig({ env: {}, fileEnv: parsed }));
});

test("setup writes a complete atomic config with restrictive permissions on Unix", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "hsc-setup-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configDir = join(root, "config");
  const values = buildSetupEnv({
    bucket: "clipboard-images",
    accessKeyId: "access-id",
    secretAccessKey: "secret",
    region: "us-east-1",
    urlMode: "presigned",
    presignExpiresIn: "604800",
    keyPrefix: "images",
    forcePathStyle: false,
    autoSubmit: false,
  });

  const path = await writeSetupEnv({ configDir, values, platform: process.platform });
  const parsed = parseEnvFile(await readFile(path, "utf8"));
  const fileStat = await stat(path);
  const dirStat = await stat(configDir);

  assert.deepEqual(parsed, values);
  if (process.platform !== "win32") {
    assert.equal(fileStat.mode & 0o777, 0o600);
    assert.equal(dirStat.mode & 0o777, 0o700);
  }
});
