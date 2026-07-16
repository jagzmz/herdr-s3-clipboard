import assert from "node:assert/strict";
import test from "node:test";

import { buildObjectKey, publicUrlForObject } from "../src/object-url.mjs";

test("object keys use a UTC date and configured prefix", () => {
  assert.equal(
    buildObjectKey({
      keyPrefix: "images",
      date: new Date("2026-07-15T23:30:00-07:00"),
      id: "test-id",
      extension: "JPG",
    }),
    "images/2026/07/16/test-id.jpg",
  );
});

test("public URLs preserve a base path and encode object path segments", () => {
  assert.equal(
    publicUrlForObject("https://img.example.com/static", "images/a folder/test image.png"),
    "https://img.example.com/static/images/a%20folder/test%20image.png",
  );
});
