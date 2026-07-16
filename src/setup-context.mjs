import { runHerdr } from "./herdr.mjs";
import { PLUGIN_ID } from "./plugin-metadata.mjs";

export { PLUGIN_ID } from "./plugin-metadata.mjs";

export function resolveSetupConfigDir({ env = process.env, run = runHerdr } = {}) {
  const injected = env.HERDR_PLUGIN_CONFIG_DIR?.trim();
  if (injected) return injected;

  const discovered = run(["plugin", "config-dir", PLUGIN_ID], env).trim();
  if (!discovered) {
    throw new Error(`Herdr returned an empty config directory for ${PLUGIN_ID}.`);
  }
  return discovered;
}
