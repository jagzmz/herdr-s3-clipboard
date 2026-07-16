import assert from "node:assert/strict";
import test from "node:test";

import { ClipboardImageError } from "../src/clipboard.mjs";
import { ConfigError } from "../src/config.mjs";
import { describeUploadError, uploadClipboardImage } from "../src/upload-action.mjs";

const IMAGE = {
  body: Buffer.from("image"),
  contentType: "image/png",
  extension: "png",
  size: 5,
};

test("public uploads insert and submit only after the upload succeeds", async () => {
  const events = [];
  const result = await uploadClipboardImage({
    loadConfiguration: async () => ({
      autoSubmit: true,
      keyPrefix: "screenshots",
      publicBaseUrl: "https://img.example.com",
      urlMode: "public",
    }),
    findCurrentPane: () => "workspace:pane",
    readImage: async () => {
      events.push("read");
      return IMAGE;
    },
    buildKey: (options) => {
      events.push(["build-key", options]);
      return "screenshots/example.png";
    },
    upload: async (_config, image, objectKey) => {
      events.push(["upload", image, objectKey]);
      return undefined;
    },
    buildPublicUrl: (baseUrl, objectKey) => {
      events.push(["build-url", baseUrl, objectKey]);
      return "https://img.example.com/screenshots/example.png";
    },
    insertText: (payload) => events.push(["insert", payload]),
    submit: (payload) => events.push(["submit", payload]),
  });

  assert.deepEqual(events.map((event) => Array.isArray(event) ? event[0] : event), [
    "read",
    "build-key",
    "upload",
    "build-url",
    "insert",
    "submit",
  ]);
  assert.deepEqual(events.at(-2), [
    "insert",
    { paneId: "workspace:pane", text: "https://img.example.com/screenshots/example.png" },
  ]);
  assert.deepEqual(result, {
    objectKey: "screenshots/example.png",
    objectUrl: "https://img.example.com/screenshots/example.png",
    paneId: "workspace:pane",
  });
});

test("an upload failure leaves the pane untouched", async () => {
  let inserted = false;
  await assert.rejects(
    () => uploadClipboardImage({
      loadConfiguration: async () => ({ autoSubmit: false, keyPrefix: "images", urlMode: "presigned" }),
      findCurrentPane: () => "workspace:pane",
      readImage: async () => IMAGE,
      buildKey: () => "images/example.png",
      upload: async () => {
        throw new Error("S3 is unavailable");
      },
      insertText: () => {
        inserted = true;
      },
    }),
    /S3 is unavailable/,
  );

  assert.equal(inserted, false);
});

test("presigned mode inserts the URL returned by the upload", async () => {
  let inserted;
  await uploadClipboardImage({
    loadConfiguration: async () => ({ autoSubmit: false, keyPrefix: "images", urlMode: "presigned" }),
    findCurrentPane: () => "workspace:pane",
    readImage: async () => IMAGE,
    buildKey: () => "images/example.png",
    upload: async () => "https://signed.example/object?signature=test",
    buildPublicUrl: () => assert.fail("public URL construction must not run in presigned mode"),
    insertText: (payload) => {
      inserted = payload;
    },
  });

  assert.deepEqual(inserted, {
    paneId: "workspace:pane",
    text: "https://signed.example/object?signature=test",
  });
});

test("upload errors are classified for actionable notifications", () => {
  const noImage = new ClipboardImageError("missing", { noImage: true });
  assert.equal(describeUploadError(noImage).title, "No clipboard image");

  const configError = new ConfigError("missing bucket");
  assert.deepEqual(describeUploadError(configError), {
    title: "S3 publisher configuration error",
    message: "missing bucket",
  });
});
