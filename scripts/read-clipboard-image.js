#!/usr/bin/osascript -l JavaScript

ObjC.import("AppKit");
ObjC.import("Foundation");

function fail(code, message) {
  throw new Error(`HSC_${code}: ${message}`);
}

function isPresent(value) {
  return value && !value.isNil();
}

function writeData(data, outputPath) {
  if (!data.writeToFileAtomically($(outputPath), true)) {
    fail("WRITE_FAILED", "could not write the clipboard image to a temporary file");
  }
}

function emit(data, outputPath, contentType, extension) {
  writeData(data, outputPath);
  // Returning from JXA's run handler writes to stdout. console.log writes to
  // stderr under osascript, which makes successful output look like an error.
  return JSON.stringify({ contentType: contentType, extension: extension });
}

function run(argv) {
  if (!argv || argv.length !== 1) {
    fail("ARGUMENTS", "expected one temporary output path");
  }

  const outputPath = ObjC.unwrap(argv[0]);
  const pasteboard = $.NSPasteboard.generalPasteboard;

  // Preserve native PNG and JPEG data exactly. macOS screenshot clipboard
  // data is often TIFF, which the Node action converts with the system `sips`
  // utility after this helper returns.
  const png = pasteboard.dataForType($("public.png"));
  if (isPresent(png)) {
    return emit(png, outputPath, "image/png", "png");
  }

  const jpeg = pasteboard.dataForType($("public.jpeg"));
  if (isPresent(jpeg)) {
    return emit(jpeg, outputPath, "image/jpeg", "jpg");
  }

  const tiff = pasteboard.dataForType($("public.tiff"));
  if (isPresent(tiff)) {
    return emit(tiff, outputPath, "image/tiff", "tiff");
  }

  fail("NO_IMAGE", "the clipboard has no PNG, JPEG, or TIFF image data");
}
