import assert from "node:assert/strict";
import test from "node:test";

import { uploadImage } from "../src/s3-upload.mjs";

class FakeGetObjectCommand {}

class FakePutObjectCommand {
  constructor(input) {
    this.input = input;
  }
}

const CONFIG = {
  bucket: "clipboard-images",
  cacheControl: "private, max-age=60",
  urlMode: "presigned",
};

const IMAGE = {
  body: Buffer.from("image"),
  contentType: "image/png",
  size: 5,
};

const COMMANDS = {
  GetObjectCommand: FakeGetObjectCommand,
  PutObjectCommand: FakePutObjectCommand,
};

test("upload waits for URL signing before destroying the S3 client", async () => {
  const events = [];
  const client = {
    send: async (command) => {
      events.push("upload");
      assert.ok(command instanceof FakePutObjectCommand);
      assert.deepEqual(command.input, {
        Body: IMAGE.body,
        Bucket: "clipboard-images",
        CacheControl: "private, max-age=60",
        ContentLength: 5,
        ContentType: "image/png",
        Key: "images/example.png",
      });
    },
    destroy: () => events.push("destroy"),
  };

  const result = await uploadImage(CONFIG, IMAGE, "images/example.png", {
    createClient: async () => client,
    loadCommands: async () => COMMANDS,
    signObjectUrl: async (receivedClient, config, objectKey, CommandClass) => {
      await Promise.resolve();
      events.push("sign");
      assert.equal(receivedClient, client);
      assert.equal(config, CONFIG);
      assert.equal(objectKey, "images/example.png");
      assert.equal(CommandClass, FakeGetObjectCommand);
      return "https://signed.example/object";
    },
  });

  assert.equal(result, "https://signed.example/object");
  assert.deepEqual(events, ["upload", "sign", "destroy"]);
});

test("upload failures still destroy the S3 client", async () => {
  let destroyed = false;
  const client = {
    send: async () => {
      throw new Error("upload failed");
    },
    destroy: () => {
      destroyed = true;
    },
  };

  await assert.rejects(
    () => uploadImage(CONFIG, IMAGE, "images/example.png", {
      createClient: async () => client,
      loadCommands: async () => COMMANDS,
    }),
    /upload failed/,
  );
  assert.equal(destroyed, true);
});
