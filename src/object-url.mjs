import { randomUUID } from "node:crypto";
import { DEFAULT_KEY_PREFIX } from "./config-schema.mjs";

export function buildObjectKey({ keyPrefix = DEFAULT_KEY_PREFIX, date = new Date(), id = randomUUID(), extension = "png" } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
    throw new TypeError("date must be a valid Date.");
  }
  if (!/^[A-Za-z0-9]+$/.test(extension)) {
    throw new TypeError("extension must contain only letters and numbers.");
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const filename = `${id}.${extension.toLowerCase()}`;

  return [keyPrefix, String(year), month, day, filename].filter(Boolean).join("/");
}

export function publicUrlForObject(publicBaseUrl, objectKey) {
  const url = new URL(publicBaseUrl);
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${encodedKey}`;
  return url.toString();
}
