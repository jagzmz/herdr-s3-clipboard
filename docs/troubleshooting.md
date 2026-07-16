# Troubleshooting

Start with the latest action logs:

```bash
herdr plugin log list --plugin hsc.s3-clipboard --limit 20
```

Confirm the plugin and actions are registered:

```bash
herdr plugin list --plugin hsc.s3-clipboard --json
herdr plugin action list --plugin hsc.s3-clipboard
```

## Common problems

| Symptom | Cause and next step |
| --- | --- |
| The configure command returns JSON with `status: "running"` | The action started successfully. Continue in the Herdr overlay. If no overlay appears, inspect the plugin log. |
| `Clipboard does not contain an image` | Copy an image or take a screenshot. A file path or image URL copied as text is not an image payload. |
| `The clipboard reader returned invalid image metadata` | The platform helper did not return the expected metadata header. Update or relink the plugin, then retry with a fresh screenshot. Check the log for helper output if it persists. |
| Linux reports no clipboard backend | Install `wl-clipboard` for Wayland or `xclip` for X11. See [Platform support](platforms.md). |
| The bucket test fails | Verify endpoint, region, bucket, and credentials. A write-only key may reject `HeadBucket`; save after failure only when that restriction is intentional. |
| The plugin reports incomplete `HSC_S3_*` configuration | Complete the preferred namespace or remove every `HSC_S3_*` value to use `S3_*`. The namespaces are never merged. |
| The wizard reports that `prefix+i` is already assigned | Review the command shown by the wizard. Choose another keybinding to continue, or skip the keybinding step and edit Herdr's config manually. Existing bindings are never replaced. |
| A newly added keybinding does not work | Run `herdr server reload-config` or restart Herdr. Confirm the active config path shown by `herdr --help`, especially when using `HERDR_CONFIG_PATH`. |
| A public URL returns `403` or `AccessDenied` | Public mode does not grant access. Configure the bucket, custom domain, or CDN for public reads and verify that the base URL maps to the selected bucket. |
| A presigned URL fails immediately | Check the endpoint, region, system clock, credential permissions, and maximum expiry of 604800 seconds. |
| The upload action cannot see a local image during `herdr --remote` | Plugin actions run on the remote server and read its clipboard. For direct agent input, use Herdr's native `remote_image_paste`. Use this plugin only where it can access the clipboard and an HTTP URL is required. |
| An expected action is missing after an update | Rerun the GitHub install command or unlink and relink the local checkout, then inspect the registered action list. |

## Inspect the effective config location

```bash
herdr plugin config-dir hsc.s3-clipboard
```

Check that the directory contains `.env`. Do not paste its contents into an issue or log because it contains credentials.

If both namespaces appear in your shell or `.env`, remember that the presence of any `HSC_S3_*` value selects the entire `HSC_S3_*` namespace. See [Namespace selection](configuration.md#namespace-selection).

## Test setup outside Herdr

Running setup in a regular terminal separates setup problems from overlay problems:

```bash
npx --yes github:jagzmz/herdr-s3-clipboard setup
```

Both setup modes target the same plugin configuration directory.

## Report a reproducible problem

Include:

- Operating system and version
- Herdr version
- Node.js version
- Storage provider and URL mode
- The action name and sanitized error text
- Steps that reproduce the problem

Never include access keys, secret keys, session tokens, full presigned URLs, or the contents of `.env`. Presigned URLs are temporary bearer tokens.

Security-sensitive reports belong in the [Security policy](../SECURITY.md), not a public issue.

Return to the [Documentation index](README.md).
