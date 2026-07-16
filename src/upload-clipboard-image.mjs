#!/usr/bin/env node

import { showNotification } from "./herdr.mjs";
import { describeUploadError, uploadClipboardImage } from "./upload-action.mjs";

async function main() {
  try {
    const { objectUrl, paneId } = await uploadClipboardImage();

    showNotification({
      title: "Clipboard image uploaded",
      body: objectUrl,
    });
    process.stdout.write(`Uploaded clipboard image and inserted its URL into pane ${paneId}.\n`);
  } catch (error) {
    const { title, message } = describeUploadError(error);
    showNotification({ title, body: message });
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

await main();
