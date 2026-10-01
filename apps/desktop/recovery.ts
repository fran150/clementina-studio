// Crash recovery: while the project has unsaved edits, a snapshot of it is
// kept in the profile's recovery folder, one file per running Studio. On the
// next start, a snapshot left by a Studio that is no longer running is
// offered back.
import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { encodeProject, decodeProject, type StudioProject } from '../../packages/assets/index.js';

/** The recovery folder. A snapshot is named after the process that wrote it: pid-time.cstudio. */
export class RecoveryStore {
  constructor(
    readonly directory: string,
    readonly id: string,
  ) {}
  /** This process's store, named after its pid and start time. */
  static forProcess(directory: string) {
    return new RecoveryStore(directory, String(process.pid) + '-' + Date.now());
  }
  /** Whether the Studio that wrote snapshot `name` is still running. */
  static ownerRunning(name: string) {
    try {
      process.kill(Number(name.split('-')[0]), 0);
      return true;
    } catch {
      return false;
    }
  }
  /** This process's snapshot file. */
  get file() {
    return path.join(this.directory, this.id + '.cstudio');
  }
  /** Writes this process's snapshot, replacing the last one in one step. */
  async save(project: StudioProject) {
    const bytes = encodeProject(project);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.file + '.tmp', bytes);
    await rename(this.file + '.tmp', this.file);
  }
  /** Removes this process's snapshot. */
  async clear() {
    await rm(this.file, { force: true });
  }
  /** Every other process's snapshot. */
  async candidates() {
    await mkdir(this.directory, { recursive: true });
    return (await readdir(this.directory)).filter(
      (n) => n.endsWith('.cstudio') && n !== this.id + '.cstudio',
    );
  }
  /** Reads snapshot `name`. */
  async read(name: string) {
    return decodeProject(await readFile(path.join(this.directory, path.basename(name)), 'utf8'));
  }
  /** Removes snapshot `name`. */
  async remove(name: string) {
    await rm(path.join(this.directory, path.basename(name)), { force: true });
  }
}
