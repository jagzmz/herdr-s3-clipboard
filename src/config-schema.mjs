export const CONFIG_FILENAME = ".env";
export const HSC_S3_PREFIX = "HSC_S3_";
export const HSC_S3_NAMESPACE = "HSC_S3_*";
export const S3_NAMESPACE = "S3_*";
export const AUTO_SUBMIT_KEY = "HSC_AUTO_SUBMIT";

export const HSC_S3_KEYS = Object.freeze({
  accountId: "HSC_S3_ACCOUNT_ID",
  endpoint: "HSC_S3_ENDPOINT",
  region: "HSC_S3_REGION",
  bucket: "HSC_S3_BUCKET",
  accessKeyId: "HSC_S3_ACCESS_KEY_ID",
  secretAccessKey: "HSC_S3_SECRET_ACCESS_KEY",
  sessionToken: "HSC_S3_SESSION_TOKEN",
  publicBaseUrl: "HSC_S3_PUBLIC_BASE_URL",
  urlMode: "HSC_S3_URL_MODE",
  presignExpiresIn: "HSC_S3_PRESIGN_EXPIRES_IN",
  keyPrefix: "HSC_S3_KEY_PREFIX",
  forcePathStyle: "HSC_S3_FORCE_PATH_STYLE",
  cacheControl: "HSC_S3_CACHE_CONTROL",
});

export const S3_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(HSC_S3_KEYS).map(([field, key]) => [field, key.replace(/^HSC_/, "")]),
));

export const REQUIRED_CONFIG_FIELDS = Object.freeze([
  "bucket",
  "accessKeyId",
  "secretAccessKey",
]);

export const DEFAULT_S3_REGION = "us-east-1";
export const DEFAULT_URL_MODE = "public";
export const DEFAULT_KEY_PREFIX = "images";
export const MAX_PRESIGN_EXPIRY_SECONDS = 604_800;
