# Repository instructions for coding agents

These instructions apply to the entire repository. Preserve user changes and keep edits within the requested scope.

## Start here

1. Read `README.md` for the user-facing purpose.
2. Read `docs/development.md` for architecture and validation commands.
3. Inspect the relevant source and tests before editing.
4. Check `git status --short` and do not overwrite unrelated work.

Use Node.js 20 or later. Install exact dependencies with `npm ci` and run the suite with `npm test`.

## Architecture boundaries

- `src/upload-clipboard-image.mjs` is the executable shell for notifications, process output, and exit status.
- `src/upload-action.mjs` orchestrates the action through injectable dependencies. It must not contain provider-specific behavior.
- `src/clipboard.mjs` owns platform selection and clipboard output validation.
- `scripts/read-clipboard-image.js` and `scripts/read-clipboard-image.ps1` own native macOS and Windows clipboard extraction.
- `src/config.mjs` owns environment loading, namespace selection, interpolation, and validation.
- `src/s3-upload.mjs` owns S3 operations and presigned URL generation.
- `src/object-url.mjs` owns public URL construction.
- `src/setup.mjs` is the shared wizard. `src/open-setup.mjs` only opens it through Herdr.
- `src/setup-context.mjs` keeps standalone and Herdr setup pointed at the same config directory.
- `src/setup-keybinding.mjs` owns the optional keybinding prompt flow and keeps command, prompt, and filesystem behavior injectable.
- `src/keybinding-config.mjs` owns Herdr config discovery, narrow keybinding inspection, backups, and atomic appends.
- `src/provider-guides.mjs` owns provider onboarding copy and official links.

Keep these responsibilities separate unless the task explicitly requires an architectural change.

## Non-negotiable behavior

- Never commit `.env`, credentials, session tokens, account-specific endpoints, bucket secrets, or complete presigned URLs.
- Prefer `HSC_S3_*` settings and retain `S3_*` compatibility.
- Namespace selection is atomic. The presence of any `HSC_S3_*` key selects that namespace; never fill missing `HSC_S3_*` values from `S3_*`.
- A partial preferred namespace must fail loudly and list every missing required key.
- Process environment values may override matching `.env` values, but they must not bypass namespace isolation.
- `HSC_S3_ENDPOINT` is an account- or service-level endpoint. The bucket remains a separate setting.
- Do not set object ACLs. Public access is an external bucket, provider, custom-domain, or CDN concern.
- Presigned expiry must remain between 1 and 604800 seconds.
- Do not change the focused pane until clipboard extraction and upload both succeed.
- Setup secrets must remain masked, saved atomically, and written with mode `0600` on Unix.
- Keybinding setup must be opt-in, detect conflicts without replacing them, confirm the target path, preserve existing config content and permissions, and create a backup before writing.
- The standalone wizard and Herdr overlay must keep using the same config directory.
- Preserve macOS, Windows, Wayland, and X11 support when changing shared clipboard logic.

## Code guidelines

- Use Node.js ESM and APIs supported by Node.js 20.
- Match existing formatting: two-space indentation, double-quoted strings, and semicolons.
- Prefer explicit function inputs and dependency injection for filesystem, process, environment, and command behavior.
- Keep platform commands isolated so unit tests run on any host operating system.
- Add no provider-specific upload fork; use the shared S3 API path.
- Add a dependency only when the standard library or an existing dependency cannot solve the problem clearly.
- Errors must explain what failed and the corrective action without echoing secret values.
- Redact credentials and presigned query strings from logs, fixtures, snapshots, and documentation.

## Tests

Behavior changes require success and failure coverage. Run:

```bash
npm ci
npm test
npm audit --omit=dev
git diff --check
```

For focused development:

```bash
node --test test/config.test.mjs
```

Use temporary directories and injected environment objects in tests. Never read or mutate the developer's real Herdr plugin config.

When configuration changes, test both namespaces, partial preferred values, unknown preferred keys, environment-over-file precedence, and secret-safe errors. When keybinding behavior changes, test existing actions, conflicts, skips, backups, atomic writes, file modes, and reload failures. When clipboard routing changes, test macOS, Windows, Wayland, X11, missing dependencies, invalid metadata, and text-only clipboard behavior.

## Herdr smoke test

Link only when an integration check is needed:

```bash
herdr plugin link .
herdr plugin action list --plugin hsc.s3-clipboard
herdr plugin log list --plugin hsc.s3-clipboard --limit 20
```

Use dedicated development credentials and a disposable object prefix. Unlink with:

```bash
herdr plugin unlink hsc.s3-clipboard
```

Do not delete a user's plugin config or change their Herdr keybindings unless the task explicitly asks for it.

## Documentation rules

Keep `README.md` limited to the overview, quick start, documentation navigation, and core safety behavior.

- Installation, updates, and uninstall: `docs/installation.md`
- Providers, settings, and URL modes: `docs/configuration.md`
- Operating-system behavior: `docs/platforms.md`
- Diagnostics: `docs/troubleshooting.md`
- Architecture and contributor workflow: `docs/development.md`
- Vulnerability and credential guidance: `SECURITY.md`
- Contribution policy: `CONTRIBUTING.md`

Use descriptive links, platform-qualified commands, fake example values, and the exact action ID `hsc.s3-clipboard`. Update every affected focused guide when behavior changes.

Validate edited Markdown with:

```bash
npx --yes markdownlint-cli2 "**/*.md" "#node_modules"
```

Run `markdown-link-check` on each edited Markdown file. Treat external rate limits separately from broken repository links.

## Versions and releases

When a runtime change requires a version bump, update all three locations together:

- `package.json`
- `package-lock.json`
- `herdr-plugin.toml`

Documentation-only changes do not require a version bump. Do not create a release, publish a package, push a branch, or open a pull request unless the user explicitly requests that external action.
