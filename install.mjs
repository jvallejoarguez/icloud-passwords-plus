#!/usr/bin/env node
// Entry point for `npx github:jvallejoarguez/icloud-passwords-plus`. npm keeps this package in a cache it can clear at
// any time, so the extension is built into a fixed folder instead. Running the command again updates it in place.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INSTALL_DIR = join(homedir(), "Library", "Application Support", "iCloud Passwords+");

try {
  execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "build.mjs"), "--out", INSTALL_DIR], {
    stdio: "inherit",
  });
} catch (error) {
  process.exitCode = error.status ?? 1; // build.mjs already printed why
}
