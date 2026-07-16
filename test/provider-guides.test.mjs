import assert from "node:assert/strict";
import test from "node:test";

import { PROVIDER_PRESETS } from "../src/setup-config.mjs";
import {
  formatProviderGuide,
  getProviderGuide,
  STORAGE_PROVIDER_CHOICES,
} from "../src/provider-guides.mjs";

test("every provider choice has actionable setup instructions", () => {
  for (const choice of STORAGE_PROVIDER_CHOICES) {
    const guide = getProviderGuide(choice.value);
    assert.ok(PROVIDER_PRESETS[guide.setupProvider]);
    assert.ok(guide.steps.length >= 3);
    assert.ok(guide.requiredValues.includes("bucket name"));
    for (const [, url] of guide.links) assert.match(url, /^https:\/\//);
  }
});

test("provider guide output includes instructions, links, and required values", () => {
  const output = formatProviderGuide("r2");

  assert.match(output, /Cloudflare R2 setup/);
  assert.match(output, /Official guides:/);
  assert.match(output, /https:\/\/developers\.cloudflare\.com\/r2\/get-started\/s3\//);
  assert.match(output, /Keep these values ready:/);
  assert.match(output, /Secret Access Key/);
});

test("managed S3 alternatives resume through generic endpoint setup", () => {
  for (const provider of ["backblaze", "digitalocean", "wasabi", "other"]) {
    const guide = getProviderGuide(provider);
    assert.equal(guide.setupProvider, "generic");
    assert.equal(guide.defaults.endpoint, "");
  }
});
