// Adds or removes FowlBrowser's Codex hooks (Stop, SubagentStop) in a hooks.json file. Each calls the turn_end tool of
// the MCP server named fowlbrowser over the session's own connection, so a turn's tabs are cleaned up in the session
// (main thread or subagent) that used them. Used by install.sh and uninstall.sh, and once by hand after `codex mcp add`:
//   node tools/codex-hooks.mjs add [hooks.json]
//   node tools/codex-hooks.mjs remove [hooks.json]
// The file defaults to $CODEX_HOME/hooks.json (~/.codex/hooks.json). A hook is ours only when it is an mcp_tool hook
// for server fowlbrowser, tool turn_end. Every other hook and key is left as it is. Codex runs a new hook only once the
// user has trusted it (/hooks).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EVENTS = ['Stop', 'SubagentStop'];
export const SERVER = 'fowlbrowser';
export const TOOL = 'turn_end';
const TIMEOUT = 10; // seconds; a turn end waits at most 3 s for tabs being attached again, the rest is closing tabs

export const isOurs = (hook) => hook?.type === 'mcp_tool' && hook.server === SERVER && hook.tool === TOOL;

export function addHooks(config) {
  const changes = [];
  for (const event of EVENTS) {
    const entries = (config.hooks ??= {})[event] ??= [];
    if (entries.some((entry) => (entry.hooks ?? []).some(isOurs))) continue;
    entries.push({ hooks: [{ type: 'mcp_tool', server: SERVER, tool: TOOL, timeout: TIMEOUT }] });
    changes.push(`added a ${event} hook`);
  }
  return changes;
}

export function removeHooks(config) {
  let removed = 0;
  for (const [event, entries] of Object.entries(config.hooks ?? {})) {
    if (!Array.isArray(entries)) continue;
    const kept = [];
    for (const entry of entries) {
      const hooks = (entry.hooks ?? []).filter((h) => !isOurs(h));
      removed += (entry.hooks?.length ?? 0) - hooks.length;
      if (hooks.length === (entry.hooks?.length ?? 0)) kept.push(entry);
      else if (hooks.length) kept.push({ ...entry, hooks });
    }
    if (kept.length) config.hooks[event] = kept; else delete config.hooks[event];
  }
  if (config.hooks && !Object.keys(config.hooks).length) delete config.hooks;
  return removed;
}

export const defaultFile = (env = process.env) => path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'hooks.json');

if (import.meta.main) {
  const [mode, file = defaultFile()] = process.argv.slice(2);
  const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const write = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`); };
  if (mode === 'add') {
    const changes = addHooks(config);
    if (changes.length) {
      write();
      for (const change of changes) console.log(`Codex: ${change} in ${file} (MCP tool ${SERVER} ${TOOL})`);
      console.log('Codex: trust them once under /hooks (Codex asks on its next start).');
    } else console.log(`Codex: FowlBrowser hooks already in ${file}`);
  } else if (mode === 'remove') {
    const removed = removeHooks(config);
    if (removed) { write(); console.log(`Codex: removed ${removed} FowlBrowser hooks from ${file}`); }
  } else {
    console.error('usage: codex-hooks.mjs add [hooks.json] | remove [hooks.json]');
    process.exit(2);
  }
}
