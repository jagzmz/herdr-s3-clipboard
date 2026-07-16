import {
  addKeybinding,
  DEFAULT_UPLOAD_KEYBINDING,
  findActionBinding,
  findKeyConflict,
  inspectKeybindings,
  resolveHerdrConfigPath,
} from "./keybinding-config.mjs";
import { runHerdr } from "./herdr.mjs";
import { UPLOAD_ACTION_ID } from "./plugin-metadata.mjs";

const KEYBINDING_DESCRIPTION = "publish clipboard image";

export async function configureUploadKeybinding({
  env = process.env,
  confirmPrompt,
  inputPrompt,
  selectPrompt,
  stdout = process.stdout,
  stderr = process.stderr,
  resolveConfigPath = resolveHerdrConfigPath,
  inspect = inspectKeybindings,
  add = addKeybinding,
  run = runHerdr,
} = {}) {
  requirePrompt(confirmPrompt, "confirmPrompt");
  requirePrompt(inputPrompt, "inputPrompt");
  requirePrompt(selectPrompt, "selectPrompt");

  let configPath;
  let inspection;
  try {
    configPath = resolveConfigPath({ env, run });
    inspection = await inspect(configPath);
  } catch (error) {
    stderr.write(`Keybinding setup was skipped: ${error.message}\n`);
    printManualKeybinding(stdout);
    return { status: "unavailable", error };
  }

  const existing = findActionBinding(inspection.bindings);
  if (existing) {
    stdout.write(`Upload action is already bound to ${existing.key} in ${configPath}.\n`);
    return { status: "existing", key: existing.key, configPath };
  }

  const shouldConfigure = await confirmPrompt({
    message: `Add a Herdr keybinding for uploads? (recommended: ${DEFAULT_UPLOAD_KEYBINDING})`,
    default: true,
  });
  if (!shouldConfigure) {
    stdout.write("Keybindings were not changed.\n");
    printManualKeybinding(stdout);
    return { status: "skipped", configPath };
  }

  let suggestedKey = DEFAULT_UPLOAD_KEYBINDING;
  while (true) {
    const key = await inputPrompt({
      message: "Upload keybinding",
      default: suggestedKey,
      validate: validateKeybinding,
    });
    const selectedKey = key.trim();
    const conflict = findKeyConflict(inspection.bindings, selectedKey);

    if (conflict) {
      stdout.write(`\n${selectedKey} is already assigned to ${describeBinding(conflict)}.\n`);
      const conflictChoice = await selectPrompt({
        message: "Keybinding conflict",
        choices: [
          { name: "Choose another keybinding", value: "retry" },
          { name: "Leave Herdr keybindings unchanged", value: "skip" },
        ],
        default: "retry",
      });
      if (conflictChoice === "skip") {
        stdout.write("Keybindings were not changed.\n");
        printManualKeybinding(stdout);
        return { status: "skipped", configPath, conflict };
      }
      suggestedKey = "";
      continue;
    }

    const confirmed = await confirmPrompt({
      message: `Add ${selectedKey} to ${configPath}?`,
      default: true,
    });
    if (!confirmed) {
      stdout.write("Keybindings were not changed.\n");
      printManualKeybinding(stdout);
      return { status: "skipped", configPath };
    }

    let result;
    try {
      result = await add({
        configPath,
        key: selectedKey,
        actionId: UPLOAD_ACTION_ID,
        description: KEYBINDING_DESCRIPTION,
      });
    } catch (error) {
      stderr.write(`Keybinding was not added: ${error.message}\n`);
      printManualKeybinding(stdout);
      return { status: "failed", configPath, error };
    }

    if (result.status === "existing") {
      stdout.write(`Upload action is already bound to ${selectedKey} in ${configPath}.\n`);
      return { status: "existing", key: selectedKey, configPath };
    }

    stdout.write(`Added ${selectedKey} to ${configPath}.\n`);
    if (result.backupPath) stdout.write(`Previous config backed up to ${result.backupPath}.\n`);

    try {
      run(["server", "reload-config"], env);
      stdout.write("Herdr configuration reloaded.\n");
    } catch {
      stdout.write("Restart Herdr, or run `herdr server reload-config`, to activate the keybinding.\n");
    }

    return { status: "added", key: selectedKey, configPath, backupPath: result.backupPath };
  }
}

export function validateKeybinding(value) {
  return String(value || "").trim().length > 0 || "Enter a Herdr keybinding, such as prefix+i.";
}

function describeBinding(binding) {
  const command = binding.command || binding.type || "another command";
  return binding.description ? `${command} (${binding.description})` : command;
}

function printManualKeybinding(output) {
  output.write(`\nYou can add a keybinding later in Herdr's config.toml:\n\n[[keys.command]]\nkey = "${DEFAULT_UPLOAD_KEYBINDING}"\ntype = "plugin_action"\ncommand = "${UPLOAD_ACTION_ID}"\ndescription = "${KEYBINDING_DESCRIPTION}"\n\n`);
}

function requirePrompt(prompt, name) {
  if (typeof prompt !== "function") throw new TypeError(`${name} must be a function.`);
}
