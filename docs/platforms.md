# Platform support

Clipboard access happens on the machine running the Herdr server. The upload and S3 code is shared across platforms; only clipboard extraction is platform-specific.

| Platform | Clipboard backend | Additional requirement |
| --- | --- | --- |
| macOS | `osascript` with AppKit pasteboard APIs | None. TIFF screenshots are converted to PNG with `sips` when available. |
| Windows | Windows PowerShell or PowerShell 7 with `System.Windows.Forms` | None. Images are encoded as PNG. |
| Linux Wayland | `wl-paste` | Install the `wl-clipboard` package. |
| Linux X11 | `xclip` | Install `xclip`. |

## Linux dependencies

Debian or Ubuntu with Wayland:

```bash
sudo apt install wl-clipboard
```

Debian or Ubuntu with X11:

```bash
sudo apt install xclip
```

Fedora users who switch between session types can install both:

```bash
sudo dnf install wl-clipboard xclip
```

The plugin tries Wayland when a Wayland display is available, then X11 when an X11 display is available. If neither matching command is installed, the error identifies the required package.

## Windows status

Herdr's native Windows host is currently preview software, so plugin execution there is best effort. See the [Herdr Windows beta documentation](https://herdr.dev/docs/windows-beta/).

The clipboard script supports Windows PowerShell and PowerShell 7. It uses the Windows Forms clipboard API and emits a PNG payload with validated metadata.

## Remote sessions

A Herdr plugin runs where the Herdr server runs:

- A Herdr server on your Mac can read your Mac clipboard, even when the focused pane contains an SSH session.
- A Herdr server on a remote Linux host reads that host's clipboard, not the clipboard on your Mac or Windows computer.
- A normal SSH connection does not forward image clipboard data.

For direct image input over `herdr --remote`, use Herdr's built-in
[`remote_image_paste`](https://herdr.dev/docs/configuration/#keybindings)
action. The local Herdr client copies the clipboard image to a temporary file
on the remote host and inserts its path into the pane. This plugin does not
replace that native bridge.

Use this plugin when the Herdr server can access the image clipboard and the
desired result is a public or presigned HTTP URL. A common example is Herdr
running locally while the focused pane contains an SSH shell: the plugin reads
the local clipboard, publishes the image, and sends the URL into that pane.

Return to the [Documentation index](README.md).
