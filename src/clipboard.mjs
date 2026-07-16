import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourceDir = dirname(fileURLToPath(import.meta.url));
const macosClipboardReader = join(sourceDir, "..", "scripts", "read-clipboard-image.js");
const windowsClipboardReader = join(sourceDir, "..", "scripts", "read-clipboard-image.ps1");
const MAX_CLIPBOARD_BYTES = 128 * 1024 * 1024;
const MAX_CLIPBOARD_MEBIBYTES = MAX_CLIPBOARD_BYTES / 1024 / 1024;
const IMAGE_FORMATS = [
  { contentType: "image/png", extension: "png" },
  { contentType: "image/jpeg", extension: "jpg" },
  { contentType: "image/webp", extension: "webp" },
  { contentType: "image/gif", extension: "gif" },
  { contentType: "image/tiff", extension: "tiff" },
  { contentType: "image/bmp", extension: "bmp" },
];

export class ClipboardImageError extends Error {
  constructor(message, { noImage = false } = {}) {
    super(message);
    this.name = "ClipboardImageError";
    this.noImage = noImage;
  }
}

export async function readClipboardImage({
  run = execFileAsync,
  temporaryDirectory = tmpdir(),
  platform = process.platform,
  env = process.env,
} = {}) {
  const directory = await mkdtemp(join(temporaryDirectory, "hsc-clipboard-"));
  const outputPath = join(directory, "clipboard-image");

  try {
    const { stdout, stderr } = await captureClipboardImage({ run, platform, env, outputPath });
    let metadata = parseMetadata(stdout, stderr);
    let body = await readClipboardFile(outputPath);

    if (platform === "darwin" && metadata.contentType === "image/tiff") {
      ({ metadata, body } = await convertTiffToPng({
        run,
        sourcePath: outputPath,
        directory,
        fallbackBody: body,
      }));
    }

    return { ...metadata, body, size: body.length };
  } catch (error) {
    if (error instanceof ClipboardImageError) throw error;

    const details = String(error?.stderr || error?.message || error);
    if (details.includes("HSC_NO_IMAGE:")) {
      throw new ClipboardImageError("Clipboard does not contain an image.", { noImage: true });
    }
    throw new ClipboardImageError(`Could not read the ${platformLabel(platform)} clipboard image: ${details.trim()}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function captureClipboardImage({ run, platform, env, outputPath }) {
  if (platform === "darwin") {
    return run("osascript", ["-l", "JavaScript", macosClipboardReader, outputPath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  }

  if (platform === "win32") {
    return captureWindowsClipboard({ run, outputPath });
  }

  if (platform === "linux") {
    return captureLinuxClipboard({ run, env, outputPath });
  }

  throw new ClipboardImageError(`Clipboard images are not supported on platform ${platform}.`);
}

async function captureWindowsClipboard({ run, outputPath }) {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-STA",
    "-File",
    windowsClipboardReader,
    outputPath,
  ];

  for (const command of ["powershell.exe", "pwsh.exe", "powershell", "pwsh"]) {
    try {
      return await run(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });
    } catch (error) {
      if (!isCommandMissing(error)) throw error;
    }
  }

  throw new ClipboardImageError("Windows clipboard support requires PowerShell.");
}

async function captureLinuxClipboard({ run, env, outputPath }) {
  const backends = linuxClipboardBackends(env);
  let availableBackend = false;
  const backendErrors = [];

  for (const backend of backends) {
    let advertisedTypes;
    try {
      const result = await run(backend.command, backend.listArgs, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });
      availableBackend = true;
      advertisedTypes = String(result.stdout || "");
    } catch (error) {
      if (isCommandMissing(error)) continue;
      availableBackend = true;
      if (isNoClipboardData(error)) continue;
      backendErrors.push(`${backend.command}: ${String(error?.stderr || error?.message || error).trim()}`);
      continue;
    }

    const format = selectImageFormat(advertisedTypes);
    if (!format) continue;

    try {
      const result = await run(backend.command, backend.readArgs(format.contentType), {
        encoding: null,
        maxBuffer: MAX_CLIPBOARD_BYTES,
      });
      const body = Buffer.isBuffer(result.stdout)
        ? result.stdout
        : Buffer.from(result.stdout || "", "binary");
      if (body.length === 0) {
        throw new Error(`${backend.command} returned an empty image`);
      }
      await writeFile(outputPath, body);
      return {
        stdout: JSON.stringify(format),
        stderr: result.stderr ? String(result.stderr) : "",
      };
    } catch (error) {
      if (isNoClipboardData(error)) {
        throw new ClipboardImageError("Clipboard does not contain an image.", { noImage: true });
      }
      throw new ClipboardImageError(
        `Could not read ${format.contentType} from ${backend.command}: ${String(error?.stderr || error?.message || error).trim()}`,
      );
    }
  }

  if (availableBackend && backendErrors.length === 0) {
    throw new ClipboardImageError("Clipboard does not contain an image.", { noImage: true });
  }
  if (backendErrors.length > 0) {
    throw new ClipboardImageError(`Linux clipboard access failed: ${backendErrors.join("; ")}`);
  }
  throw new ClipboardImageError(
    "Linux clipboard image support requires wl-paste (Wayland) or xclip (X11).",
  );
}

function linuxClipboardBackends(env) {
  const wayland = {
    command: "wl-paste",
    listArgs: ["--list-types"],
    readArgs: (contentType) => ["--no-newline", "--type", contentType],
  };
  const x11 = {
    command: "xclip",
    listArgs: ["-selection", "clipboard", "-t", "TARGETS", "-o"],
    readArgs: (contentType) => ["-selection", "clipboard", "-t", contentType, "-o"],
  };

  if (env.WAYLAND_DISPLAY) return env.DISPLAY ? [wayland, x11] : [wayland];
  if (env.DISPLAY) return [x11, wayland];
  return [wayland, x11];
}

function selectImageFormat(advertisedTypes) {
  const types = new Set(advertisedTypes.split(/\s+/).map((type) => type.toLowerCase()).filter(Boolean));
  return IMAGE_FORMATS.find((format) => types.has(format.contentType));
}

function isCommandMissing(error) {
  return error?.code === "ENOENT";
}

function isNoClipboardData(error) {
  const details = String(error?.stderr || error?.message || error).toLowerCase();
  return /nothing is copied|no selection|clipboard is empty|target .* not available/.test(details);
}

function platformLabel(platform) {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  return platform;
}

async function convertTiffToPng({ run, sourcePath, directory, fallbackBody }) {
  const pngPath = join(directory, "clipboard-image.png");
  try {
    await run("/usr/bin/sips", ["-s", "format", "png", sourcePath, "--out", pngPath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const body = await readClipboardFile(pngPath);
    return {
      metadata: { contentType: "image/png", extension: "png" },
      body,
    };
  } catch {
    // Sips can fail for provider-specific or malformed TIFF variants. The
    // original image remains a valid S3 object, so preserve it rather than
    // making an otherwise successful clipboard upload fail.
    return {
      metadata: { contentType: "image/tiff", extension: "tiff" },
      body: fallbackBody,
    };
  }
}

async function readClipboardFile(path) {
  const file = await stat(path);
  if (file.size === 0) {
    throw new ClipboardImageError("The clipboard image was empty.");
  }
  if (file.size > MAX_CLIPBOARD_BYTES) {
    throw new ClipboardImageError(
      `The clipboard image exceeds the ${MAX_CLIPBOARD_MEBIBYTES} MiB limit.`,
    );
  }
  return readFile(path);
}

function parseMetadata(stdout = "", stderr = "") {
  const lines = [stdout, stderr]
    .flatMap((output) => String(output || "").trim().split(/\r?\n/))
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    try {
      const metadata = JSON.parse(line);
      const format = IMAGE_FORMATS.find((candidate) => (
        metadata?.contentType === candidate.contentType
        && metadata?.extension === candidate.extension
      ));
      if (format) {
        return format;
      }
    } catch {
      // Ignore helper diagnostics and continue looking for JSON metadata.
    }
  }

  throw new ClipboardImageError("The clipboard reader returned invalid image metadata.");
}
