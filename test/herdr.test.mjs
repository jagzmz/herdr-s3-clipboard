import assert from "node:assert/strict";
import test from "node:test";

import { HerdrCommandError, pluginPaneOpenArgs } from "../src/herdr.mjs";

test("overlay plugin pane arguments rely on Herdr's active pane", () => {
  assert.deepEqual(
    pluginPaneOpenArgs({
      pluginId: "hsc.s3-clipboard",
      entrypoint: "setup",
      placement: "overlay",
      focus: true,
    }),
    [
      "plugin", "pane", "open",
      "--plugin", "hsc.s3-clipboard",
      "--entrypoint", "setup",
      "--placement", "overlay",
      "--focus",
    ],
  );
});

test("overlay plugin panes reject an explicit target pane", () => {
  assert.throws(
    () => pluginPaneOpenArgs({
      pluginId: "hsc.s3-clipboard",
      entrypoint: "setup",
      placement: "overlay",
      targetPaneId: "workspace:pane",
    }),
    HerdrCommandError,
  );
});
