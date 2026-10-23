// The build of the extension code a service worker runs: a hash of its code files, read once as the worker starts (so
// files replaced on disk without a reload still give the old build). The MCP server hashes the extension folder it was
// installed with the same way (mcp/src/extensionBuild.mjs) and tells agents when the browser runs another one.
export const CODE_FILES = ['manifest.json', 'background.js', 'core.js', 'build.js'];

export async function hashFiles(read) {
  const parts = [];
  for (const name of CODE_FILES) parts.push(name, '\0', await read(name), '\0');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('')));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function ownBuild(chrome) {
  return hashFiles(async (name) => {
    const response = await fetch(chrome.runtime.getURL(name));
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    return response.text();
  }).catch(() => null);
}
