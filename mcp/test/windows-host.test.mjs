import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { endpoint, privateWindowsDirectory } from '../src/platform.mjs';

test('Windows endpoints isolate directories and normalize path case', () => {
  assert.equal(endpoint('C:\\Users\\Nico\\.fowlbrowser\\chrome.sock', 'win32'), endpoint('c:\\users\\nico\\.fowlbrowser\\chrome.sock', 'win32'));
  assert.notEqual(endpoint('C:\\one\\chrome.sock', 'win32'), endpoint('C:\\two\\chrome.sock', 'win32'));
  assert.match(endpoint('C:\\one\\chrome.sock', 'win32'), /^\\\\\.\\pipe\\fowlbrowser-[a-f0-9]{64}$/);
  assert.equal(endpoint('/tmp/chrome.sock', 'darwin'), '/tmp/chrome.sock');
});

const frame = (message) => {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
};
function reader(callback) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
      const end = 4 + buffer.readUInt32LE(0);
      callback(JSON.parse(buffer.subarray(4, end).toString('utf8')));
      buffer = buffer.subarray(end);
    }
  };
}

test('Windows host: native framing, authentication, isolated clients and profile collision', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const tempRoot = fs.realpathSync.native(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'fowl-win-test-'));
  const processes = [];
  const sockets = [];
  try {
    privateWindowsDirectory(dir);
    process.env.FOWLBROWSER_DIR = dir;
    const { HostClient } = await import('../src/hostClient.mjs');
    const start = async () => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../../host/host.mjs', import.meta.url))], {
        env: { ...process.env, FOWLBROWSER_DIR: dir, FOWLBROWSER_BROWSER: 'chrome' }, windowsHide: true,
      });
      processes.push(child);
      let errors = '';
      child.stderr.on('data', (chunk) => { errors += chunk; });
      const ready = new Promise((resolve, reject) => {
        child.once('exit', (code) => reject(new Error(`Host exited ${code}: ${errors}`)));
        child.stdout.on('data', reader((message) => {
          if (message.method === 'host.listening') resolve(path.join(dir, `${message.params.key}.sock`));
          if (message.id !== undefined) {
            child.stdin.write(frame({ id: message.id, result: { method: message.method, client: message.client, params: message.params } }));
            if (message.method === 'client.hello') child.stdin.write(frame({ method: 'extension.initialized', params: [], client: message.client }));
          }
        }));
      });
      child.stdin.write(frame({ method: 'extension.hello', params: { userAgent: 'Chrome/142.0', version: '0.1.0' } }));
      return { child, socketPath: await ready };
    };
    const first = await start();
    assert.equal(path.basename(first.socketPath), 'chrome.sock');
    const a = new HostClient(first.socketPath);
    const b = new HostClient(first.socketPath);
    sockets.push(a, b);
    await Promise.all([a.connect('A'), b.connect('B')]);
    const [ra, rb] = await Promise.all([a.request('test.echo', { value: 'A' }), b.request('test.echo', { value: 'B' })]);
    assert.equal(ra.params.value, 'A');
    assert.equal(rb.params.value, 'B');
    assert.notEqual(ra.client, rb.client);
    const denied = net.connect(endpoint(first.socketPath));
    denied.on('error', () => {});
    denied.write(frame({ method: 'host.auth', params: { token: 'incorrect' } }));
    await new Promise((resolve) => denied.once('close', resolve));
    const second = await start();
    assert.equal(path.basename(second.socketPath), 'chrome-2.sock');
    await new Promise((resolve) => { second.child.once('exit', resolve); second.child.stdin.end(); });
    assert.equal(fs.existsSync(second.socketPath), false);
    // Abrupt termination leaves a discovery marker; next host must reclaim the same pipe name.
    for (const socket of sockets) socket.close();
    await new Promise((resolve) => { first.child.once('exit', resolve); first.child.kill(); });
    const restarted = await start();
    assert.equal(path.basename(restarted.socketPath), 'chrome.sock');
    const access = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[System.IO.Directory]::GetAccessControl($env:FOWLBROWSER_ACL_TARGET).Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }'],
      { env: { ...process.env, FOWLBROWSER_ACL_TARGET: dir }, windowsHide: true, encoding: 'utf8' });
    assert.ok(!access.includes('S-1-1-0'), 'Everyone must not access the token directory');
    assert.ok(!access.includes('S-1-5-32-545'), 'Users must not access the token directory');
  } finally {
    for (const socket of sockets) socket.close();
    await Promise.all(processes.filter((child) => child.exitCode === null && child.signalCode === null).map((child) => new Promise((resolve) => { child.once('exit', resolve); child.kill(); })));
    if (!path.resolve(dir).startsWith(tempRoot + path.sep + 'fowl-win-test-')) throw new Error('Invalid test cleanup path');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows local files remain refused until Windows file checks are implemented', { skip: process.platform !== 'win32' }, async () => {
  const { localFileBlock, localFileRefusal } = await import('../src/util.mjs');
  assert.match(localFileBlock('file:///C:/Users/test/Documents/test.html'), /not yet supported/);
  assert.match(localFileRefusal('C:\\Users\\test\\.ssh\\id_rsa'), /not yet supported/);
  assert.equal(localFileBlock('https://example.com'), undefined);
});
