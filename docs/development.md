# Development guide

The plugin is plain Node.js ESM. It has no compile step: Herdr runs the source files declared in `herdr-plugin.toml`.

## Set up a checkout

Requirements:

- Node.js 20 or later
- npm
- Herdr 0.7.0 or later for integration testing
- The clipboard dependency for your platform

Clone, install, and test:

```bash
git clone https://github.com/jagzmz/herdr-s3-clipboard.git
cd herdr-s3-clipboard
npm ci
npm test
```

Link the checkout into Herdr:

```bash
herdr plugin link .
```

On Windows PowerShell:

```powershell
herdr plugin link (Get-Location).Path
```

Herdr now executes the files in the checkout. Remove the link with:

```bash
herdr plugin unlink hsc.s3-clipboard
```

## Project structure

| Path | Responsibility |
| --- | --- |
| `herdr-plugin.toml` | Declares plugin metadata, actions, panes, and supported platforms. |
| `src/upload-clipboard-image.mjs` | Handles action notifications, process output, and exit status. |
| `src/upload-action.mjs` | Coordinates clipboard reading, upload, URL generation, and pane insertion through injectable dependencies. |
| `src/clipboard.mjs` | Chooses the native clipboard backend and validates its output. |
| `src/config.mjs` | Reads `.env`, selects one namespace, and validates settings. |
| `src/s3-upload.mjs` | Uploads objects, tests bucket access, and signs GET URLs. |
| `src/object-url.mjs` | Constructs public object URLs. |
| `src/setup.mjs` | Runs the shared interactive setup wizard. |
| `src/setup-keybinding.mjs` | Coordinates the optional, conflict-aware keybinding prompts through injectable dependencies. |
| `src/keybinding-config.mjs` | Discovers, inspects, backs up, and atomically updates Herdr's config. |
| `src/open-setup.mjs` | Opens setup as a Herdr overlay. |
| `src/setup-context.mjs` | Resolves the shared config directory for both setup modes. |
| `src/provider-guides.mjs` | Defines provider onboarding text and official links. |
| `scripts/` | Contains macOS and Windows clipboard helpers. |
| `test/` | Contains Node test-runner unit and integration-boundary tests. |

## Run tests

Run the complete suite:

```bash
npm test
```

Run one file while developing:

```bash
node --test test/config.test.mjs
```

The tests must not read or overwrite a developer's real plugin config. Use dependency injection and temporary directories for platform commands, environment values, and config writes.

Current coverage includes:

- Clipboard routing on macOS, Windows, Wayland, and X11
- Clipboard metadata validation
- Atomic `HSC_S3_*` and `S3_*` namespace selection
- Endpoint template interpolation
- Provider onboarding and setup persistence
- Keybinding discovery, conflict handling, backups, and atomic config writes
- Presigned and public URL generation
- Object key construction
- Herdr pane insertion behavior

## Test setup safely

Run the wizard against a temporary directory instead of your real credentials.

On macOS or Linux:

```bash
test_root="$(mktemp -d)"
HERDR_PLUGIN_CONFIG_DIR="$test_root/plugin" \
HERDR_CONFIG_PATH="$test_root/config.toml" \
npm run setup
```

On Windows PowerShell:

```powershell
$testRoot = Join-Path $env:TEMP ([guid]::NewGuid())
$env:HERDR_PLUGIN_CONFIG_DIR = Join-Path $testRoot "plugin"
$env:HERDR_CONFIG_PATH = Join-Path $testRoot "config.toml"
npm run setup
Remove-Item Env:HERDR_PLUGIN_CONFIG_DIR
Remove-Item Env:HERDR_CONFIG_PATH
```

Use placeholder credentials and skip the live connection test for a UI-only
check. Both overrides are important: one isolates S3 credentials and the other
prevents a keybinding test from reading or changing your real Herdr config.

## Run an integration smoke test

After linking the checkout:

1. Confirm both actions are registered with `herdr plugin action list --plugin hsc.s3-clipboard`.
2. Run setup and save a known test bucket in the plugin config directory.
3. Copy a real image, invoke the upload action, and verify the URL reaches the focused pane.
4. Test the configured URL in an appropriate client before sharing it.
5. Inspect `herdr plugin log list --plugin hsc.s3-clipboard --limit 20` for warnings or leaked values.

Use dedicated development credentials and a disposable bucket prefix. Do not test with production credentials.

## Cross-platform expectations

A platform-specific change must preserve the behavior of all backends:

- Return exactly one validated metadata header and the image payload expected by `src/clipboard.mjs`.
- Reject text-only clipboards without changing the focused prompt.
- Keep OS-specific commands isolated behind injectable process runners.
- Add or update tests for macOS, Windows, Wayland, and X11 routing when shared selection logic changes.
- Document any new system dependency in [Platform support](platforms.md).

## Validate documentation

Run Markdown lint across repository documentation:

```bash
npx --yes markdownlint-cli2 "**/*.md" "#node_modules"
```

Check each edited Markdown file for broken links:

```bash
npx --yes markdown-link-check README.md
npx --yes markdown-link-check docs/development.md
```

Repeat the second command for every edited Markdown file. External link checks can fail because of a provider outage or rate limit; inspect those failures rather than ignoring them.

## Before submitting a change

Run:

```bash
npm ci
npm test
npm audit --omit=dev
git diff --check
```

Then verify:

- New behavior has tests for success and failure paths.
- Error messages state what failed and how to correct it.
- Logs, fixtures, and docs contain no credentials or presigned URLs.
- User-facing changes are documented in the focused guide, not appended indiscriminately to the root README.
- Runtime version changes are synchronized between `package.json`, `package-lock.json`, and `herdr-plugin.toml`.

Documentation-only changes do not require a plugin version bump.

GitHub Actions repeats the test suite on Node.js 20, 22, and 24 on Linux, plus Node.js 20 on macOS and Windows. A pull request should not be merged while any required CI job is failing.

Continue with [Contributing](../CONTRIBUTING.md) or return to the [Documentation index](README.md).
