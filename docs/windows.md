# Windows setup (fork)

Requires Git and Node.js 22.19 or newer. Run from this checkout:

```powershell
node install-windows.mjs
```

To install or update only Chrome, use `node install-windows.mjs --browser chrome`.
After an update, reload the extension with `node tools/fb.mjs -b chrome reload-if-idle`.
This reports that a later attempt is needed if agents still own tabs; it does not interrupt them.

The installer creates a versioned runtime under `Documents\FowlBrowserRuntime`,
keeps the unpacked extension at `Documents\FowlBrowserRuntime\extension`,
and registers the native host in HKCU for detected Chrome, Edge, Brave and Chromium installations.
It does not change browser profiles, security settings or execution policy.
Helium and other Chromium derivatives are not yet detected by this Windows installer.
Old runtime versions and extension backups remain available for recovery.

In each registered browser, open its extensions page, enable Developer mode,
choose Load unpacked and select the absolute extension path printed by the installer.
Do not enable incognito access. File URL access is not required for this Windows build.

The installer prints the absolute Node and server paths. Register them with the MCP client,
for example `codex mcp add fowlbrowser --env FOWLBROWSER_LABEL=Codex -- <node-path> <server-path>`.
Restart the client afterwards. Client registration is separate from native-host installation.

## Scope and known limitations

- Browser control uses authenticated Windows named pipes. Discovery markers and the shared
  authentication token live in the current user's `.fowlbrowser` directory, protected with a Windows ACL.
- Web tabs, snapshots and browser actions use the existing extension and MCP tool implementations.
- Local file navigation and file uploads are explicitly refused until Windows-specific ACL,
  alternate-stream and quarantine checks are implemented. Enabling file URL access does not remove this restriction.
- macOS automatic browser reopening and Claude turn-end hooks are disabled on Windows.
  Open the desired browser yourself; session-end cleanup remains active.
- Debug-file logging remains unavailable on Windows; browser host logs are available in `.fowlbrowser\logs`.
- Native-host tests cover authentication, framing, concurrent clients, profile collisions and stale markers.
  A real browser smoke test still requires the unpacked extension to be loaded manually.

Run Windows transport tests with `node --test mcp/test/windows-host.test.mjs`.
After loading the extension, use `browser_list`, then `tab_open` with `https://example.com`,
check the title, and close only that new tab using `tab_close`.
