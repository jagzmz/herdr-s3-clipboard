import assert from "node:assert/strict";
import test from "node:test";

import { resolveSetupConfigDir } from "../src/setup-context.mjs";

test("setup uses the config directory injected by a Herdr plugin pane", () => {
  let called = false;
  const result = resolveSetupConfigDir({
    env: { HERDR_PLUGIN_CONFIG_DIR: " /plugin/config " },
    run: () => {
      called = true;
      return "unused";
    },
  });

  assert.equal(result, "/plugin/config");
  assert.equal(called, false);
});

test("standalone setup discovers the same directory through Herdr", () => {
  const env = { PATH: "/bin" };
  let invocation;
  const result = resolveSetupConfigDir({
    env,
    run: (args, receivedEnv) => {
      invocation = { args, env: receivedEnv };
      return "/standalone/config\n";
    },
  });

  assert.equal(result, "/standalone/config");
  assert.deepEqual(invocation, {
    args: ["plugin", "config-dir", "hsc.s3-clipboard"],
    env,
  });
});

test("standalone setup rejects an empty config-dir response", () => {
  assert.throws(
    () => resolveSetupConfigDir({ env: {}, run: () => "\n" }),
    /empty config directory/,
  );
});
