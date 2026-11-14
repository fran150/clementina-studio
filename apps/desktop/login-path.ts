// A Studio opened from Finder or a desktop launcher starts with the system's
// minimal PATH instead of the one the user's shell sets up, so the tools the
// Builder runs by name (cc65's ca65 and ld65, clementina-automation,
// clementina-render) are not found when Homebrew or `clementina-dev on`
// installed them. Studio adopts the login shell's PATH before any tool runs.
import { spawnSync } from 'node:child_process';

const MARKER = '__CLEMENTINA_STUDIO_PATH__';

/** Where package managers put tools, kept on PATH in case the shell cannot be asked. */
const FALLBACK: Record<string, string[]> = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin'],
  linux: ['/usr/local/bin'],
};

/**
 * Puts the login shell's PATH entries first in `env.PATH`, keeping the
 * current ones after them. Windows apps already inherit the user's PATH.
 */
export function adoptLoginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): void {
  if (platform === 'win32') return;
  const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  // The markers keep anything the startup files print out of the result.
  const result = spawnSync(shell, ['-ilc', `printf '${MARKER}%s${MARKER}' "$PATH"`], {
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const login = typeof result.stdout === 'string' ? result.stdout.split(MARKER)[1] : undefined;
  const entries = [
    ...(login ?? '').split(':'),
    ...(env.PATH ?? '').split(':'),
    ...(FALLBACK[platform] ?? []),
  ];
  env.PATH = [...new Set(entries.filter(Boolean))].join(':');
}
