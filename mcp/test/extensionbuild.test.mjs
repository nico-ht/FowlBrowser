// The extension build check (src/extensionBuild.mjs against extension/build.js): both sides hash the same files the
// same way, and browser_list notes a browser that runs another build than the one installed with the server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { hashFiles as extensionHash, CODE_FILES as EXTENSION_FILES } from '../../extension/build.js';
import { buildMismatch, CODE_FILES, EXTENSION_DIR, hashFiles, installedBuild } from '../src/extensionBuild.mjs';
import { registerTools } from '../src/tools.mjs';

const read = (name) => fs.readFileSync(path.join(EXTENSION_DIR, name), 'utf8');

test('the server hashes the extension folder exactly as the extension hashes its own code', async () => {
  assert.deepEqual(CODE_FILES, EXTENSION_FILES);
  const installed = installedBuild();
  assert.match(installed, /^[0-9a-f]{16}$/);
  assert.equal(hashFiles(read), installed);
  assert.equal(await extensionHash(async (name) => read(name)), installed);
});

test('a changed code file is another build; a folder without the extension has none', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-build-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of CODE_FILES) fs.copyFileSync(path.join(EXTENSION_DIR, name), path.join(dir, name));
  assert.equal(installedBuild(dir), installedBuild());
  fs.appendFileSync(path.join(dir, 'core.js'), '\n// changed\n');
  assert.notEqual(installedBuild(dir), installedBuild());
  fs.rmSync(path.join(dir, 'build.js'));
  assert.equal(installedBuild(dir), null);
});

test('mismatch: same build or unknown install says nothing; another or no build (an older extension) says what to do', () => {
  assert.equal(buildMismatch({ build: 'aaaa' }, 'aaaa'), null);
  assert.equal(buildMismatch({ build: 'aaaa' }, null), null);
  assert.equal(buildMismatch(null, 'aaaa'), null);
  assert.match(buildMismatch({ build: 'bbbb' }, 'aaaa'), /it runs bbbb, installed is aaaa/);
  assert.match(buildMismatch({ userAgent: 'Chrome/155' }, 'aaaa'), /it runs an older build.*reload FowlBrowser.*Load unpacked on /);
});

test('browser_list notes a browser whose extension is another build, and only that one', async () => {
  const browser = (key, build) => ({
    key, name: key, version: '155', chromiumVersion: null, silentDebugger: true, tabs: new Map(),
    host: { hello: { extension: { userAgent: 'Chrome/155', ...(build !== undefined && { build }) } } },
  });
  const tools = {};
  const browsers = [browser('chrome', installedBuild()), browser('helium', 'beefbeefbeefbeef'), browser('chrome-2')];
  registerTools({ registerTool: (name, meta, handler) => { tools[name] = handler; } }, { all: async () => browsers, asleep: () => [] });
  const text = (await tools.browser_list({})).content.map((c) => c.text).join('\n');
  const notes = text.split('\n').filter((line) => line.includes('Note:'));
  assert.equal(notes.length, 2, text);
  assert.match(notes[0], /it runs beefbeefbeefbeef/);
  assert.match(notes[1], /it runs an older build/);
});
