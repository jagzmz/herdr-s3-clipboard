import assert from "node:assert/strict";
import test from "node:test";

import { ConfigError, parseEnvFile, resolveConfig } from "../src/config.mjs";

function complete(prefix, overrides = {}) {
  return {
    [`${prefix}_BUCKET`]: "clipboard-images",
    [`${prefix}_ACCESS_KEY_ID`]: "access-key",
    [`${prefix}_SECRET_ACCESS_KEY`]: "secret-key",
    [`${prefix}_PUBLIC_BASE_URL`]: "https://img.example.com",
    ...overrides,
  };
}

test("HSC_S3_ACCOUNT_ID wins over S3_ACCOUNT_ID when the HSC namespace is selected", () => {
  const config = resolveConfig({
    env: complete("HSC_S3", {
      HSC_S3_ACCOUNT_ID: "hsc-account",
      S3_ACCOUNT_ID: "generic-account",
    }),
  });

  assert.equal(config.namespace, "HSC_S3_*");
  assert.equal(config.accountId, "hsc-account");
});

test("S3_ACCOUNT_ID is accepted when no HSC_S3 value exists", () => {
  const config = resolveConfig({
    env: complete("S3", { S3_ACCOUNT_ID: "generic-account" }),
  });

  assert.equal(config.namespace, "S3_*");
  assert.equal(config.accountId, "generic-account");
});

test("a partial HSC_S3 namespace fails instead of merging missing values from S3", () => {
  assert.throws(
    () => resolveConfig({
      env: {
        HSC_S3_BUCKET: "hsc-only-bucket",
        ...complete("S3"),
      },
    }),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /Incomplete HSC_S3_\* configuration/);
      assert.match(error.message, /HSC_S3_ACCESS_KEY_ID/);
      assert.match(error.message, /S3_\* values were ignored/);
      return true;
    },
  );
});

test("an HSC_S3 value in the plugin .env also prevents merging process S3 values", () => {
  assert.throws(
    () => resolveConfig({
      env: complete("S3"),
      fileEnv: { HSC_S3_ACCOUNT_ID: "partial-hsc-config" },
    }),
    /Incomplete HSC_S3_\* configuration/,
  );
});

test("an unrecognised non-empty HSC_S3_* value still selects the HSC namespace", () => {
  assert.throws(
    () => resolveConfig({
      env: {
        HSC_S3_TYPO: "present",
        ...complete("S3"),
      },
    }),
    /Incomplete HSC_S3_\* configuration/,
  );
});

test("an explicitly blank HSC_S3_* value also prevents fallback to S3", () => {
  assert.throws(
    () => resolveConfig({
      env: {
        HSC_S3_BUCKET: "",
        ...complete("S3"),
      },
    }),
    /Incomplete HSC_S3_\* configuration/,
  );
});

test("generic S3 endpoint values are ignored when a complete HSC namespace is selected", () => {
  const config = resolveConfig({
    env: complete("HSC_S3", {
      S3_ENDPOINT: "https://should-not-be-used.example",
    }),
  });

  assert.equal(config.endpoint, undefined);
});

test("presigned mode does not require a public base URL", () => {
  const env = complete("HSC_S3", {
    HSC_S3_URL_MODE: "presigned",
    HSC_S3_PRESIGN_EXPIRES_IN: "3600",
  });
  delete env.HSC_S3_PUBLIC_BASE_URL;

  const config = resolveConfig({ env });

  assert.equal(config.urlMode, "presigned");
  assert.equal(config.publicBaseUrl, undefined);
  assert.equal(config.presignExpiresIn, 3600);
});

test("public mode still requires a public base URL", () => {
  const env = complete("S3", { S3_URL_MODE: "public" });
  delete env.S3_PUBLIC_BASE_URL;

  assert.throws(
    () => resolveConfig({ env }),
    /missing S3_PUBLIC_BASE_URL/,
  );
});

test("presigned URL expiry defaults to seven days and enforces the SigV4 limit", () => {
  const env = complete("S3", { S3_URL_MODE: "presigned" });
  delete env.S3_PUBLIC_BASE_URL;
  assert.equal(resolveConfig({ env }).presignExpiresIn, 604_800);

  assert.throws(
    () => resolveConfig({
      env: { ...env, S3_PRESIGN_EXPIRES_IN: "604801" },
    }),
    /S3_PRESIGN_EXPIRES_IN must be an integer from 1 to 604800/,
  );
});

test("URL mode rejects unknown values", () => {
  assert.throws(
    () => resolveConfig({
      env: complete("HSC_S3", { HSC_S3_URL_MODE: "forever" }),
    }),
    /HSC_S3_URL_MODE must be public or presigned/,
  );
});

test("HSC configuration can use its account ID in a generic endpoint template", () => {
  const config = resolveConfig({
    env: complete("HSC_S3", {
      HSC_S3_ACCOUNT_ID: "abc123",
      HSC_S3_ENDPOINT: "https://{accountId}.storage.example",
    }),
  });

  assert.equal(config.endpoint, "https://abc123.storage.example");
});

test("S3 endpoints reject embedded credentials and signing-unsafe URL components", () => {
  const base = complete("HSC_S3", { HSC_S3_URL_MODE: "presigned" });
  delete base.HSC_S3_PUBLIC_BASE_URL;

  assert.throws(
    () => resolveConfig({
      env: { ...base, HSC_S3_ENDPOINT: "https://user:password@s3.example.com" },
    }),
    /HSC_S3_ENDPOINT must not contain embedded credentials/,
  );
  assert.throws(
    () => resolveConfig({
      env: { ...base, HSC_S3_ENDPOINT: "https://s3.example.com?bucket=images" },
    }),
    /HSC_S3_ENDPOINT must not contain a query string or fragment/,
  );
});

test("public base URLs reject embedded credentials", () => {
  assert.throws(
    () => resolveConfig({
      env: complete("HSC_S3", {
        HSC_S3_PUBLIC_BASE_URL: "https://user:password@img.example.com",
      }),
    }),
    /HSC_S3_PUBLIC_BASE_URL must not contain embedded credentials/,
  );
});

test("dotenv parser supports comments, quotes, and export", () => {
  assert.deepEqual(
    parseEnvFile("# a comment\nexport S3_BUCKET = 'images bucket'\nS3_REGION=us-east-1 # default\n"),
    { S3_BUCKET: "images bucket", S3_REGION: "us-east-1" },
  );
});
