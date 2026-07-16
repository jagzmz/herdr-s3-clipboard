# Configuration

The interactive wizard is the recommended setup method. It validates the required values, masks secrets, writes one shared `.env` file for both standalone and Herdr use, and can add the upload keybinding safely.

## Run the setup wizard

From any regular terminal, without a running Herdr server:

```bash
npx --yes github:jagzmz/herdr-s3-clipboard setup
```

From a repository checkout:

```bash
npm run setup
```

Inside a running Herdr workspace:

```bash
herdr plugin action invoke hsc.s3-clipboard.configure
```

The Herdr command starts the action and returns JSON immediately. Continue in the setup overlay that opens in Herdr.

Both entry points write to the directory reported by:

```bash
herdr plugin config-dir hsc.s3-clipboard
```

A running Herdr server is not required, but the Herdr CLI must be installed so the standalone wizard can discover the plugin config directory. Set `HERDR_PLUGIN_CONFIG_DIR` explicitly only when you need an isolated directory for development or testing.

## Start without an S3 account

The wizard asks whether you already have an S3-compatible bucket and access credentials.

If you do not, choose a provider:

- Amazon S3
- Cloudflare R2
- Backblaze B2
- DigitalOcean Spaces
- Wasabi
- MinIO
- Another S3-compatible service

The wizard prints a provider-specific checklist and links to official instructions. After creating a bucket and credentials, choose **Continue setup**. Choose **Exit setup** to leave the existing config unchanged.

The optional connection test sends an S3 `HeadBucket` request. Write-only credentials can reject this test even when uploads are allowed. Save after a failed test only when that restriction is intentional and the remaining values are verified.

## Choose a URL mode

| Mode | Use it when | Required setting | Behavior |
| --- | --- | --- | --- |
| `presigned` | The bucket is private | Credentials and bucket | Anyone with the URL can read that object until the signature expires. |
| `public` | A bucket, custom domain, or CDN already serves the objects | `HSC_S3_PUBLIC_BASE_URL` | The base URL must map to the configured bucket and object key. |

Presigned URLs can last from 1 to 604800 seconds. The default is 604800 seconds, or seven days.

Public mode does not change a bucket policy or object ACL. Configure public delivery through the provider, bucket policy, custom domain, or CDN.

## Provider examples

Use the wizard when possible. These examples are for reviewing or creating `.env` manually.

### Cloudflare R2 with a private bucket

```dotenv
HSC_S3_ACCOUNT_ID=your-account-id
HSC_S3_ENDPOINT=https://{accountId}.r2.cloudflarestorage.com
HSC_S3_REGION=auto
HSC_S3_BUCKET=clipboard-images
HSC_S3_ACCESS_KEY_ID=...
HSC_S3_SECRET_ACCESS_KEY=...
HSC_S3_URL_MODE=presigned
HSC_S3_PRESIGN_EXPIRES_IN=604800
```

Keep the bucket out of `HSC_S3_ENDPOINT`; provide it separately through `HSC_S3_BUCKET`.

### AWS S3 with a private bucket

```dotenv
HSC_S3_REGION=us-east-1
HSC_S3_BUCKET=clipboard-images
HSC_S3_ACCESS_KEY_ID=...
HSC_S3_SECRET_ACCESS_KEY=...
HSC_S3_URL_MODE=presigned
HSC_S3_PRESIGN_EXPIRES_IN=604800
```

Leave `HSC_S3_ENDPOINT` unset so the AWS SDK can select the regional endpoint.

### Generic S3-compatible service

```dotenv
HSC_S3_ENDPOINT=https://s3.provider.example
HSC_S3_REGION=us-east-1
HSC_S3_BUCKET=clipboard-images
HSC_S3_ACCESS_KEY_ID=...
HSC_S3_SECRET_ACCESS_KEY=...
HSC_S3_URL_MODE=public
HSC_S3_PUBLIC_BASE_URL=https://img.example.com
```

For MinIO and other services that require path-style requests, add:

```dotenv
HSC_S3_FORCE_PATH_STYLE=true
```

## Namespace selection

Prefer `HSC_S3_*` settings. Equivalent `S3_*` names are supported for compatibility, but the two namespaces are never merged.

- If any `HSC_S3_*` setting exists, including an empty or unrecognized one, the plugin reads only `HSC_S3_*` settings.
- If the selected namespace is incomplete, the plugin reports every missing required key and ignores all `S3_*` settings.
- The plugin reads `S3_*` settings only when no `HSC_S3_*` setting exists.

This atomic selection prevents a bucket from one configuration from being combined with credentials from another. Process environment values override values with the same name in `.env`, but they do not change the no-mixing rule.

For each `HSC_S3_*` setting below, the fallback name removes the `HSC_` prefix. For example, `HSC_S3_BUCKET` becomes `S3_BUCKET`.

## Setting reference

| Setting | Required | Default | Purpose |
| --- | --- | --- | --- |
| `HSC_S3_BUCKET` | Always | — | Destination bucket name. |
| `HSC_S3_ACCESS_KEY_ID` | Always | — | S3 access key ID. |
| `HSC_S3_SECRET_ACCESS_KEY` | Always | — | S3 secret access key. |
| `HSC_S3_REGION` | No | `us-east-1` | S3 signing and endpoint region. Use `auto` for R2. |
| `HSC_S3_ENDPOINT` | Non-AWS providers | AWS SDK default | Account- or service-level HTTP(S) endpoint. Do not append the bucket. |
| `HSC_S3_ACCOUNT_ID` | Endpoint templates only | — | Replaces `{accountId}` in `HSC_S3_ENDPOINT`. |
| `HSC_S3_SESSION_TOKEN` | Temporary credentials only | — | Session token paired with temporary credentials. |
| `HSC_S3_URL_MODE` | No | `public` | Selects `public` or `presigned` URL generation. |
| `HSC_S3_PUBLIC_BASE_URL` | Public mode | — | Public bucket, custom-domain, or CDN origin. |
| `HSC_S3_PRESIGN_EXPIRES_IN` | No | `604800` | Presigned URL lifetime in seconds, from 1 to 604800. |
| `HSC_S3_KEY_PREFIX` | No | `images` | Prefix before the date and generated filename. |
| `HSC_S3_FORCE_PATH_STYLE` | No | `false` | Uses `/bucket/key` requests instead of bucket subdomains. |
| `HSC_S3_CACHE_CONTROL` | No | — | Sets the uploaded object's `Cache-Control` metadata. |

`HSC_AUTO_SUBMIT` is outside both S3 namespaces. Set it to `true` to press Enter after inserting a URL. It defaults to `false`.

## Create the config file manually

Create `.env` in the plugin config directory. A template is available as `config.env.example` in the repository root.

On macOS or Linux, from the repository root:

```bash
config_dir="$(herdr plugin config-dir hsc.s3-clipboard)"
cp config.env.example "$config_dir/.env"
chmod 600 "$config_dir/.env"
```

On Windows PowerShell:

```powershell
$configDir = herdr plugin config-dir hsc.s3-clipboard
Copy-Item config.env.example (Join-Path $configDir ".env")
notepad (Join-Path $configDir ".env")
```

The wizard writes the file atomically and applies mode `0600` on Unix. The file is still plaintext; never commit or share it.

## Add Herdr keybindings

After the storage configuration is saved, the wizard offers
`prefix+i` as the upload keybinding. This step is optional.

Before writing, the wizard:

1. Discovers the active Herdr config path from `HERDR_CONFIG_PATH` or the
   Herdr CLI.
2. Leaves the config unchanged when the upload action is already bound.
3. Checks whether the selected key is assigned to another command.
4. Shows the conflicting command and lets you enter another key or skip.
5. Confirms the exact key and config path.
6. Creates a uniquely named backup, appends the binding atomically, and
   preserves the config file's permissions.
7. Tries to reload a running Herdr server. If no server is running, the saved
   binding takes effect after Herdr starts or restarts.

The setup wizard never replaces or removes an existing keybinding. A conflict
must be resolved by choosing a different key or editing Herdr's config yourself.

To configure the binding manually, add the following block to the config path
shown by `herdr --help`:

```toml
[[keys.command]]
key = "prefix+i"
type = "plugin_action"
command = "hsc.s3-clipboard.upload-clipboard-image"
description = "publish clipboard image"
```

Optionally reopen setup from Herdr:

```toml
[[keys.command]]
key = "prefix+shift+i"
type = "plugin_action"
command = "hsc.s3-clipboard.configure"
description = "configure S3 image publisher"
```

You can also open the setup pane directly:

```bash
herdr plugin pane open \
  --plugin hsc.s3-clipboard \
  --entrypoint setup \
  --placement overlay \
  --focus
```

Reload keybinding changes with:

```bash
herdr server reload-config
```

Return to the [Documentation index](README.md).
