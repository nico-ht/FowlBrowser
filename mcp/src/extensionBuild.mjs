// The build of the extension installed next to this server (../../extension, in the repo and in the installed app),
// hashed like the extension hashes its own code (extension/build.js), so a browser running another build (not
// reloaded since an update, or loaded from another folder) can be told apart. null when the folder isn't there.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
export const CODE_FILES = ['manifest.json', 'background.js', 'core.js', 'build.js'];

export function hashFiles(read) {
  const hash = crypto.createHash('sha256');
  for (const name of CODE_FILES) hash.update(`${name}\0${read(name)}\0`);
  return hash.digest('hex').slice(0, 16);
}

let installed;
export function installedBuild(dir = EXTENSION_DIR) {
  if (dir !== EXTENSION_DIR) return readBuild(dir);
  if (installed === undefined) installed = readBuild(dir);
  return installed;
}

function readBuild(dir) {
  try {
    return hashFiles((name) => fs.readFileSync(path.join(dir, name), 'utf8'));
  } catch {
    return null;
  }
}

// What browser_list adds for a browser whose extension isn't this server's: nothing when they match, or when either
// build is unknown and the extension never said one (a test double, a dev setup without the folder).
export function buildMismatch(extension, expected = installedBuild()) {
  if (!expected || !extension) return null;
  const running = extension.build ?? null;
  if (running === expected) return null;
  return 'its FowlBrowser extension is not the build installed with this server (' +
    (running ? `it runs ${running}, installed is ${expected}` : 'it runs an older build') +
    `), so fixes since then are missing there: ask the user to open the browser's extensions page and reload FowlBrowser, ` +
    `or, if it was loaded from another folder, use Load unpacked on ${EXTENSION_DIR}`;
}
