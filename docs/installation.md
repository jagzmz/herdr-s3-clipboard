# Install, update, or uninstall

This guide covers GitHub-managed installations and local development links. The commands differ because Herdr owns a managed checkout but only points to a linked checkout.

## Requirements

- [Herdr](https://herdr.dev/docs/install/) 0.7.0 or later
- Node.js 20 or later
- An S3-compatible bucket and upload credentials
- A platform clipboard backend listed in [Platform support](platforms.md)

## Install from GitHub

```bash
herdr plugin install jagzmz/herdr-s3-clipboard
```

Confirm the plugin and its actions are registered:

```bash
herdr plugin list --plugin hsc.s3-clipboard --json
herdr plugin action list --plugin hsc.s3-clipboard
```

Continue with [Configuration](configuration.md).

## Link a development checkout

Use a link when you want Herdr to run the files in a local clone:

```bash
git clone https://github.com/jagzmz/herdr-s3-clipboard.git
cd herdr-s3-clipboard
npm ci
herdr plugin link .
```

On Windows PowerShell, replace the last command with:

```powershell
herdr plugin link (Get-Location).Path
```

See the [Development guide](development.md) before changing the code.

## Update a GitHub-managed installation

Run the install command again to replace the managed checkout with the current repository version:

```bash
herdr plugin install jagzmz/herdr-s3-clipboard
```

Your plugin configuration directory is separate from the installed source and remains in place. Review release changes before updating when they include configuration changes.

For a local link, pull or edit the linked checkout instead. Do not install the GitHub version over an active local link.

## Uninstall

### 1. Identify the installation type

```bash
herdr plugin list --plugin hsc.s3-clipboard --json
```

Use the command that matches the reported source:

- GitHub-managed installation: `herdr plugin uninstall`
- Local development checkout: `herdr plugin unlink`

### 2. Remove the plugin registration

For a GitHub-managed installation:

```bash
herdr plugin uninstall hsc.s3-clipboard
```

For a local development link:

```bash
herdr plugin unlink hsc.s3-clipboard
```

Unlinking does not delete your repository checkout.

### 3. Remove Herdr keybindings

The setup wizard can add the upload keybinding, but uninstalling or unlinking
does not remove it automatically. This avoids deleting user-owned Herdr config.

Delete keybinding blocks whose commands are either of the following:

```text
hsc.s3-clipboard.upload-clipboard-image
hsc.s3-clipboard.configure
```

Reload the Herdr configuration:

```bash
herdr server reload-config
```

The wizard's config backups use names such as
`config.toml.hsc-s3-clipboard.bak`. They are deliberately retained during
uninstall. Review and remove obsolete backups yourself.

### 4. Optionally delete credentials

Uninstalling or unlinking deliberately preserves the plugin config directory. This makes reinstalling safer, but it also leaves the `.env` file and credentials on disk.

If you want a complete removal, capture the config path before uninstalling, then delete it. This is irreversible.

On macOS or Linux:

```bash
config_dir="$(herdr plugin config-dir hsc.s3-clipboard)"
herdr plugin uninstall hsc.s3-clipboard
rm -rf -- "$config_dir"
```

Use `herdr plugin unlink hsc.s3-clipboard` on the second line when the plugin is locally linked.

On Windows PowerShell:

```powershell
$configDir = herdr plugin config-dir hsc.s3-clipboard
herdr plugin uninstall hsc.s3-clipboard
Remove-Item -Recurse -Force $configDir
```

Use `herdr plugin unlink hsc.s3-clipboard` on the second line for a local link.

Deleting the config directory does not revoke an access key. Revoke the key in your storage provider when it may be exposed or is no longer needed.

### 5. Verify removal

```bash
herdr plugin list --plugin hsc.s3-clipboard --json
```

The result should no longer contain `hsc.s3-clipboard`. If an action is still available, restart Herdr and inspect the plugin list for another installation of the same ID.

Return to the [Documentation index](README.md).
