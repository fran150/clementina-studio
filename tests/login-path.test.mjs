import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adoptLoginShellPath } from '../dist/apps/desktop/login-path.js';

/** A stand-in login shell that prints startup noise around the PATH it reports. */
async function fakeShell(script) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-shell-'));
  const shell = path.join(dir, 'shell');
  await writeFile(shell, `#!/bin/sh\n${script}\n`);
  await chmod(shell, 0o755);
  return shell;
}

test(
  'the login shell PATH goes first and the current entries stay',
  { skip: process.platform === 'win32' },
  async () => {
    const shell = await fakeShell(
      `echo 'welcome'; PATH=/opt/homebrew/bin:/home/me/.clementina/dev/bin:/usr/bin; eval "$2"; echo done`,
    );
    const env = { SHELL: shell, PATH: '/usr/bin:/bin' };
    adoptLoginShellPath(env, 'darwin');
    assert.equal(
      env.PATH,
      '/opt/homebrew/bin:/home/me/.clementina/dev/bin:/usr/bin:/bin:/usr/local/bin',
    );
  },
);

test(
  'a shell that fails still leaves the package-manager folders on PATH',
  { skip: process.platform === 'win32' },
  async () => {
    const env = { SHELL: await fakeShell('exit 1'), PATH: '/usr/bin:/bin' };
    adoptLoginShellPath(env, 'darwin');
    assert.equal(env.PATH, '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin');
  },
);

test('Windows keeps its PATH', () => {
  const env = { PATH: 'C:\\Windows' };
  adoptLoginShellPath(env, 'win32');
  assert.equal(env.PATH, 'C:\\Windows');
});
