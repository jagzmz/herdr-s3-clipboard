import { ClipboardImageError, readClipboardImage } from "./clipboard.mjs";
import { ConfigError, loadConfig } from "./config.mjs";
import { currentPaneId, sendTextToPane, submitPane } from "./herdr.mjs";
import { buildObjectKey, publicUrlForObject } from "./object-url.mjs";
import { uploadImage } from "./s3-upload.mjs";

export async function uploadClipboardImage({
  loadConfiguration = loadConfig,
  findCurrentPane = currentPaneId,
  readImage = readClipboardImage,
  buildKey = buildObjectKey,
  upload = uploadImage,
  buildPublicUrl = publicUrlForObject,
  insertText = sendTextToPane,
  submit = submitPane,
} = {}) {
  const config = await loadConfiguration();
  const paneId = findCurrentPane();
  if (!paneId) {
    throw new ConfigError("No active Herdr pane was provided to the plugin action.");
  }

  const image = await readImage();
  const objectKey = buildKey({
    keyPrefix: config.keyPrefix,
    extension: image.extension,
  });

  // Do not alter the terminal prompt until the object is durably uploaded.
  const presignedUrl = await upload(config, image, objectKey);
  const objectUrl = config.urlMode === "presigned"
    ? presignedUrl
    : buildPublicUrl(config.publicBaseUrl, objectKey);
  if (!objectUrl) {
    throw new Error("The S3 upload completed, but no object URL was generated.");
  }

  insertText({ paneId, text: objectUrl });
  if (config.autoSubmit) submit({ paneId });

  return { objectKey, objectUrl, paneId };
}

export function describeUploadError(error) {
  if (error instanceof ClipboardImageError && error.noImage) {
    return {
      title: "No clipboard image",
      message: "Clipboard does not contain an image; nothing was inserted.",
    };
  }
  if (error instanceof ConfigError) {
    return { title: "S3 publisher configuration error", message: error.message };
  }
  return { title: "Clipboard image upload failed", message: error?.message || String(error) };
}
