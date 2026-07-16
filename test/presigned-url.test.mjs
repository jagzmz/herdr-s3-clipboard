import assert from "node:assert/strict";
import test from "node:test";

import { S3Client } from "@aws-sdk/client-s3";

import { createPresignedGetUrl } from "../src/s3-upload.mjs";

test("presigned GET URLs use the configured bucket, object key, and expiry", async () => {
  const client = new S3Client({
    region: "auto",
    endpoint: "https://example-account.r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
    },
  });

  try {
    const signedUrl = await createPresignedGetUrl(
      client,
      { bucket: "private-images", presignExpiresIn: 3600 },
      "images/2026/07/example.png",
    );
    const url = new URL(signedUrl);

    assert.match(url.hostname, /example-account\.r2\.cloudflarestorage\.com$/);
    assert.match(url.pathname, /images\/2026\/07\/example\.png$/);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "3600");
    assert.ok(url.searchParams.has("X-Amz-Signature"));
  } finally {
    client.destroy();
  }
});
