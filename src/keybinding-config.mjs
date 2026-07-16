import {
  constants,
  copyFile,
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { runHerdr } from "./herdr.mjs";
import { UPLOAD_ACTION_ID } from "./plugin-metadata.mjs";

export const DEFAULT_UPLOAD_KEYBINDING = "prefix+i";

export class KeybindingConflictError extends Error {
  constructor(key, binding) {
    super(`Herdr keybinding ${key} is already assigned.`);
    this.name = "KeybindingConflictError";
    this.key = key;
    this.binding = binding;
  }
}

export function resolveHerdrConfigPath({ env = process.env, run = runHerdr } = {}) {
  const overridden = env.HERDR_CONFIG_PATH?.trim();
  if (overridden) return overridden;

  const help = run(["--help"], env);
  const match = String(help).match(/^Config:\s*(.+?)\s*$/m);
  if (!match?.[1]) {
    throw new Error("Could not discover Herdr's config.toml path. Set HERDR_CONFIG_PATH and run setup again.");
  }
  return match[1];
}

export async function inspectKeybindings(configPath, { read = readFile } = {}) {
  const source = await readConfigSource(configPath, read);
  return { configPath, source, bindings: parseKeybindings(source) };
}

export function parseKeybindings(source) {
  const bindings = [];
  let current;

  const finishCurrent = () => {
    if (!current) return;
    if (Object.keys(current).length > 0) bindings.push(current);
    current = undefined;
  };

  for (const line of String(source || "").split(/\r?\n/)) {
    if (/^\s*\[\[\s*keys\.command\s*\]\]\s*(?:#.*)?$/.test(line)) {
      finishCurrent();
      current = {};
      continue;
    }
    if (/^\s*\[{1,2}[^\]]+\]{1,2}\s*(?:#.*)?$/.test(line)) {
      finishCurrent();
      continue;
    }
    if (!current) continue;

    const assignment = parseStringAssignment(line);
    if (assignment && ["key", "type", "command", "description"].includes(assignment.name)) {
      current[assignment.name] = assignment.value;
    }
  }

  finishCurrent();
  return bindings;
}

export function findActionBinding(bindings, actionId = UPLOAD_ACTION_ID) {
  return bindings.find((binding) => (
    binding.command === actionId
    && normalizeKey(binding.key).length > 0
  ));
}

export function findKeyConflict(bindings, key, actionId = UPLOAD_ACTION_ID) {
  const normalized = normalizeKey(key);
  return bindings.find((binding) => (
    normalizeKey(binding.key) === normalized
    && binding.command !== actionId
  ));
}

export async function addKeybinding({
  configPath,
  key,
  actionId = UPLOAD_ACTION_ID,
  description = "publish clipboard image",
  platform = process.platform,
  fs = {},
}) {
  const operations = {
    chmod: fs.chmod || chmod,
    copyFile: fs.copyFile || copyFile,
    lstat: fs.lstat || lstat,
    mkdir: fs.mkdir || mkdir,
    readFile: fs.readFile || readFile,
    realpath: fs.realpath || realpath,
    rename: fs.rename || rename,
    stat: fs.stat || stat,
    unlink: fs.unlink || unlink,
    writeFile: fs.writeFile || writeFile,
  };
  const selectedKey = String(key || "").trim();
  if (!selectedKey) throw new Error("A non-empty Herdr keybinding is required.");

  const source = await readConfigSource(configPath, operations.readFile);
  const bindings = parseKeybindings(source);
  const existing = bindings.find((binding) => (
    normalizeKey(binding.key) === normalizeKey(selectedKey)
    && binding.command === actionId
  ));
  if (existing) return { status: "existing", binding: existing };

  const conflict = findKeyConflict(bindings, selectedKey, actionId);
  if (conflict) throw new KeybindingConflictError(selectedKey, conflict);

  await operations.mkdir(dirname(configPath), { recursive: true });
  const existingFile = source !== "" || await fileExists(configPath, operations.lstat);
  let mode = 0o600;
  let backupPath;
  let writePath = configPath;
  if (existingFile) {
    const entry = await operations.lstat(configPath);
    const file = entry.isSymbolicLink() ? await operations.stat(configPath) : entry;
    if (entry.isSymbolicLink()) writePath = await operations.realpath(configPath);
    mode = file.mode & 0o777;
    backupPath = await createBackup(configPath, operations.copyFile);
  }

  const temporaryPath = `${writePath}.${process.pid}.${randomUUID()}.tmp`;
  const updated = appendBinding(source, {
    key: selectedKey,
    type: "plugin_action",
    command: actionId,
    description,
  });

  try {
    await operations.writeFile(temporaryPath, updated, { encoding: "utf8", flag: "wx", mode });
    if (platform !== "win32") await operations.chmod(temporaryPath, mode);
    await operations.rename(temporaryPath, writePath);
  } catch (error) {
    await operations.unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return {
    status: "added",
    binding: { key: selectedKey, type: "plugin_action", command: actionId, description },
    backupPath,
  };
}

function parseStringAssignment(line) {
  const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*("(?:\\.|[^"\\])*"|'[^']*')/);
  if (!match) return undefined;

  try {
    return {
      name: match[1],
      value: match[2].startsWith("\"")
        ? JSON.parse(match[2])
        : match[2].slice(1, -1),
    };
  } catch {
    return undefined;
  }
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function appendBinding(source, binding) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const block = [
    "[[keys.command]]",
    `key = ${JSON.stringify(binding.key)}`,
    `type = ${JSON.stringify(binding.type)}`,
    `command = ${JSON.stringify(binding.command)}`,
    `description = ${JSON.stringify(binding.description)}`,
    "",
  ].join(newline);

  if (!source) return block;
  if (source.endsWith(`${newline}${newline}`)) return `${source}${block}`;
  if (source.endsWith(newline)) return `${source}${newline}${block}`;
  return `${source}${newline}${newline}${block}`;
}

async function readConfigSource(path, read) {
  try {
    return await read(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function fileExists(path, getStat) {
  try {
    await getStat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function createBackup(configPath, copy) {
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? "" : `.${index}`;
    const backupPath = `${configPath}.hsc-s3-clipboard${suffix}.bak`;
    try {
      await copy(configPath, backupPath, constants.COPYFILE_EXCL);
      return backupPath;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not create a unique backup for ${configPath}.`);
}
