import { spawnSync } from "node:child_process";

export class HerdrCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "HerdrCommandError";
  }
}

export function currentPaneId(env = process.env) {
  if (nonEmpty(env.HERDR_PANE_ID)) return env.HERDR_PANE_ID.trim();

  const context = parseContext(env.HERDR_PLUGIN_CONTEXT_JSON);
  const candidates = [
    context?.pane_id,
    context?.pane?.id,
    context?.focused_pane_id,
    context?.focused_pane?.id,
    context?.focusedPane?.id,
  ];
  return candidates.find((candidate) => nonEmpty(candidate))?.trim();
}

export function sendTextToPane({ paneId, text, env = process.env }) {
  runHerdr(["pane", "send-text", paneId, text], env);
}

export function submitPane({ paneId, env = process.env }) {
  runHerdr(["pane", "send-keys", paneId, "enter"], env);
}

export function showNotification({ title, body, env = process.env }) {
  try {
    runHerdr(["notification", "show", title, "--body", body], env);
  } catch {
    // A notification must never turn a successful upload into a failure.
  }
}

export function pluginPaneOpenArgs({ pluginId, entrypoint, placement = "overlay", focus = true, targetPaneId }) {
  if (placement === "overlay" && targetPaneId) {
    throw new HerdrCommandError("Overlay plugin panes always target Herdr's active pane.");
  }

  const args = [
    "plugin", "pane", "open",
    "--plugin", pluginId,
    "--entrypoint", entrypoint,
    "--placement", placement,
    focus ? "--focus" : "--no-focus",
  ];
  if (targetPaneId) args.push("--target-pane", targetPaneId);
  return args;
}

export function runHerdr(args, env = process.env) {
  const herdr = env.HERDR_BIN_PATH || "herdr";
  const result = spawnSync(herdr, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });

  if (result.error) {
    throw new HerdrCommandError(`Could not run Herdr: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const reason = (result.stderr || result.stdout || `exit status ${result.status}`).trim();
    throw new HerdrCommandError(`Herdr command failed: ${reason}`);
  }

  return result.stdout;
}

function parseContext(value) {
  if (!nonEmpty(value)) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
