// Windows user-scope installer. No elevation, execution-policy changes, or browser profile edits.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateWindowsDirectory } from './mcp/src/platform.mjs';

if (process.platform !== 'win32') throw new Error('Use sh install.sh on macOS');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node.js 22.19 or newer is required');
execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
const browserFlag = process.argv.indexOf('--browser');
const selectedBrowser = browserFlag < 0 ? null : process.argv[browserFlag + 1];
if (browserFlag >= 0 && !['chrome', 'edge', 'brave', 'chromium'].includes(selectedBrowser)) {
  throw new Error('--browser must be chrome, edge, brave or chromium');
}
const source = path.dirname(fileURLToPath(import.meta.url));
// Store outside redirected AppData: packaged Codex and external browsers must see the same files.
const base = path.join(os.homedir(), 'Documents', 'FowlBrowserRuntime');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const app = path.join(base, 'versions', stamp);
const extension = path.join(base, 'extension');
privateWindowsDirectory(base);
privateWindowsDirectory(path.join(os.homedir(), '.fowlbrowser'));
fs.mkdirSync(app, { recursive: true });
const exclude = (src) => !['node_modules', 'test', 'NOTES.md'].includes(path.basename(src));
for (const folder of ['mcp', 'host', 'tools']) {
  fs.cpSync(path.join(source, folder), path.join(app, folder), { recursive: true, filter: exclude });
}
const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
if (!fs.existsSync(npm)) throw new Error('npm-cli.js is missing beside Node.js; install a full Node.js distribution');
execFileSync(process.execPath, [npm, 'ci', '--omit=dev', '--no-audit', '--no-fund', ...(process.argv.includes('--lite') ? ['--omit=optional'] : [])], {
  cwd: path.join(app, 'mcp'), windowsHide: true, stdio: 'inherit', timeout: 300000,
});
// Keep the unpacked-extension path stable. Retain the old version for recovery before an update.
if (fs.existsSync(extension)) fs.cpSync(extension, path.join(app, 'previous-extension'), { recursive: true });
fs.cpSync(path.join(source, 'extension'), extension, { recursive: true, filter: exclude });

const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
const candidates = [
  { key: 'chrome', name: 'Chrome', exe: 'Google/Chrome/Application/chrome.exe', profile: 'Google/Chrome/User Data', registry: 'Google\\Chrome', page: 'chrome://extensions' },
  { key: 'edge', name: 'Edge', exe: 'Microsoft/Edge/Application/msedge.exe', profile: 'Microsoft/Edge/User Data', registry: 'Microsoft\\Edge', page: 'edge://extensions' },
  { key: 'brave', name: 'Brave', exe: 'BraveSoftware/Brave-Browser/Application/brave.exe', profile: 'BraveSoftware/Brave-Browser/User Data', registry: 'BraveSoftware\\Brave-Browser', page: 'brave://extensions' },
  { key: 'chromium', name: 'Chromium', exe: 'Chromium/Application/chrome.exe', profile: 'Chromium/User Data', registry: 'Chromium', page: 'chrome://extensions' },
];
const browsers = candidates.filter((browser) => (!selectedBrowser || browser.key === selectedBrowser) &&
  (roots.some((root) => fs.existsSync(path.join(root, browser.exe))) || fs.existsSync(path.join(process.env.LOCALAPPDATA, browser.profile))));
const quote = (value) => '"' + value.replaceAll('%', '%%') + '"';
const registrations = [];
for (const browser of browsers) {
  const wrapper = path.join(app, 'host', `fowlbrowser-${browser.key}.cmd`);
  fs.writeFileSync(wrapper, `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "FOWLBROWSER_BROWSER=${browser.key}"\r\n${quote(process.execPath)} ${quote(path.join(app, 'host', 'host.mjs'))}\r\n`, 'utf8');
  const manifestPath = path.join(app, 'host', `${browser.key}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    name: 'com.fowl.browser', description: 'FowlBrowser native messaging host', path: wrapper, type: 'stdio',
    allowed_origins: ['chrome-extension://lpfcnmmimgcillacmnibffooadlofjhj/'],
  }, null, 2) + '\n', 'utf8');
  const registry = `HKCU\\Software\\${browser.registry}\\NativeMessagingHosts\\com.fowl.browser`;
  // Preserve previous registrations; other native-messaging hosts are never changed.
  try { fs.writeFileSync(path.join(app, 'host', `${browser.key}-previous.txt`), execFileSync('reg.exe', ['query', registry, '/ve'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), 'utf8'); } catch {}
  execFileSync('reg.exe', ['add', registry, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { windowsHide: true, stdio: 'ignore' });
  registrations.push({ name: browser.name, page: browser.page, registry, manifestPath });
}
const summary = { app, extension, node: process.execPath, server: path.join(app, 'mcp', 'src', 'server.mjs'), registrations,
  limitations: ['Windows local file access and uploads are disabled pending ACL and quarantine support.', 'Automatic browser reopening and Claude turn-end hooks are macOS-only.'] };
fs.writeFileSync(path.join(base, 'installed.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 2));
