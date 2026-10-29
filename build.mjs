#!/usr/bin/env node
// Builds iCloud Passwords+ into ./dist (or the folder after --out) from Apple's official iCloud Passwords extension
// (Chrome Web Store). Apple's code is downloaded at build time, never stored in this repository.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const outFlag = process.argv.indexOf("--out");
const OUT = outFlag === -1 ? join(ROOT, "dist") : resolve(process.argv[outFlag + 1] ?? "");
// The output folder is wiped on every build, so only ever replace an earlier build.
const firstBuild = !existsSync(join(OUT, "manifest.json"));
if (firstBuild && existsSync(OUT) && readdirSync(OUT).length)
  throw new Error(`${OUT} isn't empty and doesn't hold an earlier build. Pick another folder.`);
// Same ID as the store build: macOS's helper only talks to this ID, and the CRX manifest carries its public key.
const EXTENSION_ID = "pejdijmoenmkgeppbflobdenhhabjlaj";
const PATCHED_VERSION = "3.4.0";
const PRETTIER = "prettier@3.3.3";
const FORMATTED_SOURCES = ["background.js", "completion_list.js", "content_script.js", "page_popup.js", "settings.js"];
const STRINGS = {
  en: {
    useStrongPassword: "Use Strong Password",
    useStrongPasswordDetail: "Saved to iCloud Keychain when you submit",
    pinIncorrect: "That code didn’t work. Enter the new code shown on your Mac.",
    generatedPasswordTitle: "Strong password generated for this site",
    copyButton: "Copy",
    copiedButton: "Copied",
  },
  es: {
    useStrongPassword: "Usar contraseña segura",
    useStrongPasswordDetail: "Se guarda en el llavero de iCloud al enviar el formulario",
    pinIncorrect: "Ese código no ha funcionado. Introduce el nuevo código que aparece en tu Mac.",
    generatedPasswordTitle: "Contraseña segura generada para este sitio",
    copyButton: "Copiar",
    copiedButton: "Copiada",
  },
  es_419: {
    useStrongPassword: "Usar contraseña segura",
    useStrongPasswordDetail: "Se guarda en el llavero de iCloud al enviar el formulario",
    pinIncorrect: "Ese código no funcionó. Ingresa el nuevo código que aparece en tu Mac.",
    generatedPasswordTitle: "Contraseña segura generada para este sitio",
    copyButton: "Copiar",
    copiedButton: "Copiada",
  },
};

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 4) + "\n");

console.log("Downloading iCloud Passwords from the Chrome Web Store…");
const response = await fetch(
  "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=141.0&acceptformat=crx3" +
    `&x=id%3D${EXTENSION_ID}%26uc`,
);
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
const crx = Buffer.from(await response.arrayBuffer());
if (crx.toString("latin1", 0, 4) !== "Cr24" || crx.readUInt32LE(4) !== 3) throw new Error("Not a CRX3 package");

// Work outside the repository so `git apply` treats the files as a plain directory.
const work = mkdtempSync(join(tmpdir(), "icloud-passwords-plus-"));
const extension = join(work, "extension");
try {
  writeFileSync(join(work, "extension.zip"), crx.subarray(12 + crx.readUInt32LE(8)));
  mkdirSync(extension);
  run("tar", ["-xf", join(work, "extension.zip"), "-C", extension]);
  rmSync(join(extension, "_metadata"), { recursive: true, force: true }); // Chromium refuses reserved "_" names when unpacked

  const manifest = readJSON(join(extension, "manifest.json"));
  if (manifest.version !== PATCHED_VERSION)
    console.warn(`Apple's extension is ${manifest.version}; the patch targets ${PATCHED_VERSION}. Trying anyway.`);

  console.log("Formatting Apple's minified sources so the patch can apply…");
  run("npx", ["--yes", PRETTIER, "--write", "--log-level", "warn", "--no-config", "--no-editorconfig", "--print-width", "110", ...FORMATTED_SOURCES], extension);

  console.log("Applying patch…");
  try {
    run("git", ["apply", "--whitespace=nowarn", join(ROOT, "patches", "extension.patch")], extension);
  } catch {
    throw new Error(`The patch no longer applies to Apple's ${manifest.version}. Please open an issue.`);
  }
  cpSync(join(ROOT, "overlay"), extension, { recursive: true });

  delete manifest.update_url;
  Object.assign(manifest, {
    name: "iCloud Passwords+",
    version: manifest.version.split(".").length < 4 ? `${manifest.version}.100` : manifest.version,
    description:
      "iCloud Passwords with a native-feeling popup, local strong password suggestions and quality-of-life fixes for Chromium browsers.",
  });
  writeJSON(join(extension, "manifest.json"), manifest);

  for (const [locale, strings] of Object.entries(STRINGS)) {
    const path = join(extension, "_locales", locale, "messages.json");
    const messages = readJSON(path);
    for (const [key, message] of Object.entries(strings)) messages[key] = { message };
    writeJSON(path, messages);
  }

  rmSync(OUT, { recursive: true, force: true });
  cpSync(extension, OUT, { recursive: true });
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (!firstBuild) {
  console.log(`\nUpdated ${OUT}\nClick reload on iCloud Passwords+ in your browser's extensions page.`);
} else {
  console.log(`\nBuilt ${OUT}\nLoad it from your browser's extensions page: Developer mode → Load unpacked → pick that folder.`);
  // ~/Library is hidden in the folder picker, so hand over the path for ⌘⇧G.
  try {
    if (process.platform === "darwin") {
      execFileSync("pbcopy", { input: OUT });
      console.log("The path is on your clipboard: in the folder picker, press ⌘⇧G, paste it and press Return.");
    }
  } catch {}
}
