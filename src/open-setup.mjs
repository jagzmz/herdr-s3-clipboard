#!/usr/bin/env node

import { pluginPaneOpenArgs, runHerdr } from "./herdr.mjs";
import { PLUGIN_ID, SETUP_ENTRYPOINT } from "./plugin-metadata.mjs";

try {
  const args = pluginPaneOpenArgs({
    pluginId: PLUGIN_ID,
    entrypoint: SETUP_ENTRYPOINT,
    placement: "overlay",
    focus: true,
  });
  runHerdr(args);
  process.stdout.write("Opened the S3 image publisher setup pane.\n");
} catch (error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
}
