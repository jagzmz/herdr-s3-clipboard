import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  addKeybinding,
  DEFAULT_UPLOAD_KEYBINDING,
  findActionBinding,
  findKeyConflict,
  inspectKeybindings,
  KeybindingConflictError,
  parseKeybindings,
  resolveHerdrConfigPath,
} from "../src/keybinding-config.mjs";
import { UPLOAD_ACTION_ID } from "../src/plugin-metadata.mjs";

test("Herdr config path prefers an explicit environment override", () => {
  let called = false;
  const result = resolveHerdrConfigPath({
    env: { HERDR_CONFIG_PATH: " /custom/config.toml " },
    run: () => {
      called = true;
      return "";
    },
  });

  assert.equal(result, "/custom/config.toml");
  assert.equal(called, false);
});

test("Herdr config path is discovered from CLI help", () => {
  let invocation;
  const env = { PATH: "/bin" };
  const result = resolveHerdrConfigPath({
    env,
    run: (args, receivedEnv) => {
      invocation = { args, env: receivedEnv };
      return "Usage: herdr\n\nConfig: /home/user/.config/herdr/config.toml\n";
    },
  });

  assert.equal(result, "/home/user/.config/herdr/config.toml");
  assert.deepEqual(invocation, { args: ["--help"], env });
});

test("Herdr config discovery fails with a corrective action", () => {
  assert.throws(
    () => resolveHerdrConfigPath({ env: {}, run: () => "Usage: herdr\n" }),
    /Set HERDR_CONFIG_PATH/,
  );
});

test("keybinding parser reads command blocks without consuming other tables", () => {
  const bindings = parseKeybindings(`
# Existing user configuration
[[keys.command]]
key = "prefix+i"
type = "plugin_action"
command = "${UPLOAD_ACTION_ID}"
description = 'publish clipboard image'

[ui]
theme = "light"

[[keys.command]] # another command
key = 'prefix+x'
type = "command"
command = "pane.close"
`);

  assert.deepEqual(bindings, [
    {
      key: "prefix+i",
      type: "plugin_action",
      command: UPLOAD_ACTION_ID,
      description: "publish clipboard image",
    },
    { key: "prefix+x", type: "command", command: "pane.close" },
  ]);
  assert.equal(findActionBinding(bindings).key, DEFAULT_UPLOAD_KEYBINDING);
  assert.equal(findKeyConflict(bindings, " PREFIX+X ").command, "pane.close");
  assert.equal(findKeyConflict(bindings, DEFAULT_UPLOAD_KEYBINDING), undefined);
  assert.equal(findActionBinding([{ command: UPLOAD_ACTION_ID }]), undefined);
});

test("adding a keybinding preserves the config, creates a backup, and is idempotent", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "hsc-keybinding-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "herdr", "config.toml");
  const original = "# User comment\n[ui]\ntheme = \"dark\"\n";
  await mkdir(join(root, "herdr"), { recursive: true });
  await writeFile(configPath, original, { encoding: "utf8", mode: 0o640 });
  if (process.platform !== "win32") await chmod(configPath, 0o640);

  const added = await addKeybinding({ configPath, key: DEFAULT_UPLOAD_KEYBINDING });
  const updated = await readFile(configPath, "utf8");
  const backup = await readFile(added.backupPath, "utf8");
  const inspected = await inspectKeybindings(configPath);

  assert.equal(added.status, "added");
  assert.equal(backup, original);
  assert.ok(updated.startsWith(original));
  assert.match(updated, /key = "prefix\+i"/);
  assert.match(updated, new RegExp(`command = "${UPLOAD_ACTION_ID.replaceAll(".", "\\.")}"`));
  assert.equal(findActionBinding(inspected.bindings).key, DEFAULT_UPLOAD_KEYBINDING);
  if (process.platform !== "win32") {
    assert.equal((await stat(configPath)).mode & 0o777, 0o640);
  }

  const unchanged = await addKeybinding({ configPath, key: DEFAULT_UPLOAD_KEYBINDING });
  assert.equal(unchanged.status, "existing");
  assert.equal(await readFile(configPath, "utf8"), updated);
});

test("a conflicting keybinding is rejected without changing the config", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "hsc-keybinding-conflict-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "config.toml");
  const source = `[[keys.command]]\nkey = "prefix+i"\ntype = "command"\ncommand = "pane.close"\n`;
  await writeFile(configPath, source, "utf8");

  await assert.rejects(
    () => addKeybinding({ configPath, key: DEFAULT_UPLOAD_KEYBINDING }),
    (error) => (
      error instanceof KeybindingConflictError
      && error.binding.command === "pane.close"
    ),
  );
  assert.equal(await readFile(configPath, "utf8"), source);
});

test("a missing Herdr config is created with restrictive Unix permissions", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "hsc-keybinding-new-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "nested", "config.toml");

  const result = await addKeybinding({ configPath, key: "prefix+u" });
  const inspected = await inspectKeybindings(configPath);

  assert.equal(result.status, "added");
  assert.equal(result.backupPath, undefined);
  assert.equal(inspected.bindings[0].key, "prefix+u");
  if (process.platform !== "win32") {
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  }
});

test("adding a keybinding preserves CRLF line endings", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "hsc-keybinding-crlf-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "config.toml");
  await writeFile(configPath, "[ui]\r\ntheme = \"dark\"\r\n", "utf8");

  await addKeybinding({ configPath, key: DEFAULT_UPLOAD_KEYBINDING });
  const updated = await readFile(configPath, "utf8");

  assert.equal(updated.replaceAll("\r\n", "").includes("\n"), false);
});

test("adding a keybinding preserves a symlinked config path", {
  skip: process.platform === "win32",
}, async (context) => {
  const root = await mkdtemp(join(tmpdir(), "hsc-keybinding-symlink-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetPath = join(root, "managed-config.toml");
  const configPath = join(root, "config.toml");
  const source = "[ui]\ntheme = \"dark\"\n";
  await writeFile(targetPath, source, "utf8");
  await symlink(targetPath, configPath);

  const result = await addKeybinding({ configPath, key: DEFAULT_UPLOAD_KEYBINDING });

  assert.equal((await lstat(configPath)).isSymbolicLink(), true);
  assert.match(await readFile(targetPath, "utf8"), /key = "prefix\+i"/);
  assert.equal(await readFile(result.backupPath, "utf8"), source);
});
