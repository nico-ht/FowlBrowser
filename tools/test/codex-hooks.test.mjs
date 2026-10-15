import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { addHooks, defaultFile, isOurs, removeHooks } from '../codex-hooks.mjs';

const ours = { type: 'mcp_tool', server: 'fowlbrowser', tool: 'turn_end', timeout: 10 };
const other = { hooks: [{ type: 'command', command: '/usr/bin/true', timeout: 5 }] };
const lookalikes = { hooks: [{ type: 'mcp_tool', server: 'fowlbrowser', tool: 'tab_close' }, { type: 'command', command: 'fowlbrowser turn_end' }] };

test('ours: only the mcp_tool hook for fowlbrowser turn_end', () => {
  assert.equal(isOurs(ours), true);
  assert.equal(isOurs({ ...ours, server: 'other' }), false);
  assert.equal(isOurs({ ...ours, type: 'command' }), false);
  for (const hook of lookalikes.hooks) assert.equal(isOurs(hook), false);
});

test('add: Stop and SubagentStop once, other hooks and keys untouched', () => {
  const config = { description: 'mine', hooks: { Stop: [other, lookalikes] } };
  assert.deepEqual(addHooks(config), ['added a Stop hook', 'added a SubagentStop hook']);
  assert.deepEqual(config.hooks.Stop, [other, lookalikes, { hooks: [ours] }]);
  assert.deepEqual(config.hooks.SubagentStop, [{ hooks: [ours] }]);
  assert.equal(config.description, 'mine');
  assert.deepEqual(addHooks(config), []);
});

test('add: a hook of ours the user changed (a longer timeout) is kept as it is', () => {
  const mine = { ...ours, timeout: 30 };
  const config = { hooks: { Stop: [{ hooks: [mine] }] } };
  assert.deepEqual(addHooks(config), ['added a SubagentStop hook']);
  assert.deepEqual(config.hooks.Stop, [{ hooks: [mine] }]);
});

test('remove: only our hooks, empty events and hooks dropped, lookalikes kept', () => {
  const config = { description: 'mine', hooks: { Stop: [other, { matcher: 'x', hooks: [ours, ...lookalikes.hooks] }] } };
  addHooks(config);
  assert.equal(removeHooks(config), 2);
  assert.deepEqual(config, { description: 'mine', hooks: { Stop: [other, { matcher: 'x', hooks: lookalikes.hooks }] } });
  const only = {};
  addHooks(only);
  assert.equal(removeHooks(only), 2);
  assert.deepEqual(only, {});
});

test('the file defaults to $CODEX_HOME/hooks.json, else ~/.codex/hooks.json; the CLI writes and removes', () => {
  assert.equal(defaultFile({ CODEX_HOME: '/x/codex' }), '/x/codex/hooks.json');
  assert.equal(defaultFile({}), path.join(os.homedir(), '.codex', 'hooks.json'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-'));
  try {
    const script = fileURLToPath(new URL('../codex-hooks.mjs', import.meta.url));
    const env = { ...process.env, CODEX_HOME: dir };
    const file = path.join(dir, 'hooks.json');
    execFileSync(process.execPath, [script, 'add'], { env });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.SubagentStop, [{ hooks: [ours] }]);
    assert.match(execFileSync(process.execPath, [script, 'add'], { env, encoding: 'utf8' }), /already/);
    execFileSync(process.execPath, [script, 'remove', file], { env });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
