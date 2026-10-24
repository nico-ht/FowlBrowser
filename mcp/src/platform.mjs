// Keep discovery filenames portable; Windows transports use deterministic named pipes.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function endpoint(socketPath, platform = process.platform) {
  if (platform !== 'win32') return socketPath;
  const canonical = path.win32.resolve(socketPath).toLowerCase();
  return '\\\\.\\pipe\\fowlbrowser-' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// POSIX chmod does not secure Windows files. Protect directories before writing tokens/results.
// Do not adopt directories outside this user's profile or through junctions/symlinks.
export function privateWindowsDirectory(dir) {
  const resolved = path.resolve(dir);
  const home = fs.realpathSync.native(os.homedir());
  if (!resolved.toLowerCase().startsWith(home.toLowerCase() + path.sep)) {
    throw new Error('FowlBrowser Windows data must stay inside the current user profile');
  }
  fs.mkdirSync(resolved, { recursive: true });
  if (!fs.lstatSync(resolved).isDirectory() || fs.realpathSync.native(resolved).toLowerCase() !== resolved.toLowerCase()) {
    throw new Error('FowlBrowser refuses redirected data directories');
  }
  const script = `
$ErrorActionPreference = 'Stop'
$target = $env:FOWLBROWSER_ACL_TARGET
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$old = [System.IO.Directory]::GetAccessControl($target)
if ($old.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $me.Value) { throw 'Directory belongs to another account' }
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetOwner($me)
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($me.Value, 'S-1-5-18', 'S-1-5-32-544')) {
  $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
[System.IO.Directory]::SetAccessControl($target, $acl)
`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FOWLBROWSER_ACL_TARGET: resolved },
  });
  return resolved;
}
