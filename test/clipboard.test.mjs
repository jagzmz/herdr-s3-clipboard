import assert from "node:assert/strict";
import { truncate, writeFile } from "node:fs/promises";
import test from "node:test";

import { readClipboardImage } from "../src/clipboard.mjs";

const IMAGE_BYTES = Buffer.from("test-image-bytes");
const METADATA = JSON.stringify({ contentType: "image/png", extension: "png" });

test("clipboard metadata is read from osascript stdout", async () => {
  const image = await readClipboardImage({
    platform: "darwin",
    run: fakeClipboardRun({ stdout: METADATA, stderr: "" }),
  });

  assert.equal(image.contentType, "image/png");
  assert.equal(image.extension, "png");
  assert.deepEqual(image.body, IMAGE_BYTES);
});

test("clipboard metadata can fall back to osascript stderr", async () => {
  const image = await readClipboardImage({
    platform: "darwin",
    run: fakeClipboardRun({ stdout: "", stderr: METADATA }),
  });

  assert.equal(image.contentType, "image/png");
  assert.equal(image.extension, "png");
});

test("clipboard metadata must describe a supported image format", async () => {
  await assert.rejects(
    () => readClipboardImage({
      platform: "darwin",
      run: fakeClipboardRun({
        stdout: JSON.stringify({ contentType: "text/plain", extension: "txt" }),
        stderr: "",
      }),
    }),
    /invalid image metadata/,
  );
});

test("clipboard images have a cross-platform size limit", async () => {
  await assert.rejects(
    () => readClipboardImage({
      platform: "darwin",
      run: async (_command, args) => {
        const outputPath = args.at(-1);
        await writeFile(outputPath, "");
        await truncate(outputPath, (128 * 1024 * 1024) + 1);
        return { stdout: METADATA, stderr: "" };
      },
    }),
    /exceeds the 128 MiB limit/,
  );
});

test("Windows clipboard images are read through PowerShell", async () => {
  const commands = [];
  const image = await readClipboardImage({
    platform: "win32",
    run: async (command, args) => {
      commands.push(command);
      await writeFile(args.at(-1), IMAGE_BYTES);
      return { stdout: METADATA, stderr: "" };
    },
  });

  assert.deepEqual(commands, ["powershell.exe"]);
  assert.equal(image.contentType, "image/png");
  assert.deepEqual(image.body, IMAGE_BYTES);
});

test("Linux Wayland clipboard images are read through wl-paste", async () => {
  const calls = [];
  const image = await readClipboardImage({
    platform: "linux",
    env: { WAYLAND_DISPLAY: "wayland-0" },
    run: async (command, args) => {
      calls.push([command, args]);
      if (args.includes("--list-types")) {
        return { stdout: "text/plain\nimage/png\n", stderr: "" };
      }
      return { stdout: IMAGE_BYTES, stderr: Buffer.alloc(0) };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "wl-paste");
  assert.equal(calls[1][0], "wl-paste");
  assert.equal(image.contentType, "image/png");
  assert.deepEqual(image.body, IMAGE_BYTES);
});

test("Linux X11 clipboard images are read through xclip", async () => {
  const image = await readClipboardImage({
    platform: "linux",
    env: { DISPLAY: ":0" },
    run: async (command, args) => {
      assert.equal(command, "xclip");
      if (args.includes("TARGETS")) {
        return { stdout: "TARGETS\nimage/jpeg\n", stderr: "" };
      }
      return { stdout: IMAGE_BYTES, stderr: Buffer.alloc(0) };
    },
  });

  assert.equal(image.contentType, "image/jpeg");
  assert.equal(image.extension, "jpg");
  assert.deepEqual(image.body, IMAGE_BYTES);
});

test("Linux reports when neither clipboard backend is installed", async () => {
  await assert.rejects(
    () => readClipboardImage({
      platform: "linux",
      env: {},
      run: async () => {
        const error = new Error("not found");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /requires wl-paste \(Wayland\) or xclip \(X11\)/,
  );
});

test("Linux reports an empty clipboard as no image", async () => {
  await assert.rejects(
    () => readClipboardImage({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0" },
      run: async () => {
        const error = new Error("wl-paste failed");
        error.code = 1;
        error.stderr = "Nothing is copied";
        throw error;
      },
    }),
    (error) => error.noImage === true,
  );
});

function fakeClipboardRun(result) {
  return async (_command, args) => {
    await writeFile(args.at(-1), IMAGE_BYTES);
    return result;
  };
}
