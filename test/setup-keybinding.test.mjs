import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_UPLOAD_KEYBINDING } from "../src/keybinding-config.mjs";
import { UPLOAD_ACTION_ID } from "../src/plugin-metadata.mjs";
import { configureUploadKeybinding, validateKeybinding } from "../src/setup-keybinding.mjs";

const CONFIG_PATH = "/test/herdr/config.toml";

test("keybinding setup leaves an existing upload binding unchanged", async () => {
  const output = captureOutput();
  const result = await configureUploadKeybinding({
    ...promptStubs(),
    stdout: output,
    resolveConfigPath: () => CONFIG_PATH,
    inspect: async () => ({
      bindings: [{ key: "prefix+u", type: "plugin_action", command: UPLOAD_ACTION_ID }],
    }),
  });

  assert.deepEqual(result, { status: "existing", key: "prefix+u", configPath: CONFIG_PATH });
  assert.match(output.value, /already bound to prefix\+u/);
});

test("keybinding setup suggests the default, confirms the change, and reloads Herdr", async () => {
  const output = captureOutput();
  const confirmCalls = [];
  const inputCalls = [];
  const addCalls = [];
  const runCalls = [];
  const confirmations = [true, true];

  const result = await configureUploadKeybinding({
    confirmPrompt: async (options) => {
      confirmCalls.push(options);
      return confirmations.shift();
    },
    inputPrompt: async (options) => {
      inputCalls.push(options);
      return options.default;
    },
    selectPrompt: unexpectedPrompt,
    stdout: output,
    resolveConfigPath: () => CONFIG_PATH,
    inspect: async () => ({ bindings: [] }),
    add: async (options) => {
      addCalls.push(options);
      return { status: "added", backupPath: `${CONFIG_PATH}.bak` };
    },
    run: (args, env) => runCalls.push({ args, env }),
    env: { PATH: "/bin" },
  });

  assert.equal(confirmCalls[0].default, true);
  assert.match(confirmCalls[0].message, /recommended: prefix\+i/);
  assert.equal(inputCalls[0].default, DEFAULT_UPLOAD_KEYBINDING);
  assert.match(confirmCalls[1].message, new RegExp(`Add prefix\\+i to ${CONFIG_PATH}`));
  assert.deepEqual(addCalls[0], {
    configPath: CONFIG_PATH,
    key: DEFAULT_UPLOAD_KEYBINDING,
    actionId: UPLOAD_ACTION_ID,
    description: "publish clipboard image",
  });
  assert.deepEqual(runCalls, [{ args: ["server", "reload-config"], env: { PATH: "/bin" } }]);
  assert.equal(result.status, "added");
  assert.match(output.value, /Previous config backed up/);
  assert.match(output.value, /configuration reloaded/);
});

test("a conflict is explained and the user can choose a different key", async () => {
  const output = captureOutput();
  const inputs = [DEFAULT_UPLOAD_KEYBINDING, "prefix+u"];
  const added = [];

  const result = await configureUploadKeybinding({
    confirmPrompt: sequencePrompt([true, true]),
    inputPrompt: async () => inputs.shift(),
    selectPrompt: async () => "retry",
    stdout: output,
    resolveConfigPath: () => CONFIG_PATH,
    inspect: async () => ({
      bindings: [{
        key: DEFAULT_UPLOAD_KEYBINDING,
        type: "command",
        command: "pane.close",
        description: "close pane",
      }],
    }),
    add: async (options) => {
      added.push(options);
      return { status: "added" };
    },
    run: () => {},
  });

  assert.match(output.value, /prefix\+i is already assigned to pane\.close \(close pane\)/);
  assert.equal(added[0].key, "prefix+u");
  assert.equal(result.key, "prefix+u");
});

test("a user can skip after a conflict without changing the config", async () => {
  let added = false;
  const output = captureOutput();
  const result = await configureUploadKeybinding({
    confirmPrompt: sequencePrompt([true]),
    inputPrompt: async () => DEFAULT_UPLOAD_KEYBINDING,
    selectPrompt: async () => "skip",
    stdout: output,
    resolveConfigPath: () => CONFIG_PATH,
    inspect: async () => ({
      bindings: [{ key: DEFAULT_UPLOAD_KEYBINDING, command: "pane.close" }],
    }),
    add: async () => {
      added = true;
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(added, false);
  assert.match(output.value, /You can add a keybinding later/);
});

test("config discovery errors do not invalidate saved storage configuration", async () => {
  const output = captureOutput();
  const errors = captureOutput();
  const result = await configureUploadKeybinding({
    ...promptStubs(),
    stdout: output,
    stderr: errors,
    resolveConfigPath: () => {
      throw new Error("Herdr was not found");
    },
  });

  assert.equal(result.status, "unavailable");
  assert.match(errors.value, /Keybinding setup was skipped: Herdr was not found/);
  assert.match(output.value, new RegExp(UPLOAD_ACTION_ID.replaceAll(".", "\\.")));
});

test("reload failures retain the added binding and provide activation instructions", async () => {
  const output = captureOutput();
  const result = await configureUploadKeybinding({
    confirmPrompt: sequencePrompt([true, true]),
    inputPrompt: async () => DEFAULT_UPLOAD_KEYBINDING,
    selectPrompt: unexpectedPrompt,
    stdout: output,
    resolveConfigPath: () => CONFIG_PATH,
    inspect: async () => ({ bindings: [] }),
    add: async () => ({ status: "added" }),
    run: () => {
      throw new Error("server is not running");
    },
  });

  assert.equal(result.status, "added");
  assert.match(output.value, /Restart Herdr/);
});

test("a binding added concurrently is reported as existing", async () => {
  const output = captureOutput();
  let reloaded = false;
  const result = await configureUploadKeybinding({
    confirmPrompt: sequencePrompt([true, true]),
    inputPrompt: async () => DEFAULT_UPLOAD_KEYBINDING,
    selectPrompt: unexpectedPrompt,
    stdout: output,
    resolveConfigPath: () => CONFIG_PATH,
    inspect: async () => ({ bindings: [] }),
    add: async () => ({ status: "existing" }),
    run: () => {
      reloaded = true;
    },
  });

  assert.equal(result.status, "existing");
  assert.equal(reloaded, false);
  assert.match(output.value, /already bound/);
});

test("keybinding validation rejects blank values", () => {
  assert.equal(validateKeybinding("  "), "Enter a Herdr keybinding, such as prefix+i.");
  assert.equal(validateKeybinding("prefix+k"), true);
});

function captureOutput() {
  return {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
}

function sequencePrompt(values) {
  return async () => values.shift();
}

function promptStubs() {
  return {
    confirmPrompt: unexpectedPrompt,
    inputPrompt: unexpectedPrompt,
    selectPrompt: unexpectedPrompt,
  };
}

async function unexpectedPrompt() {
  throw new Error("Prompt was not expected.");
}
