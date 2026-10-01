// The recovery snapshot of the open window (see recovery.ts): kept while the
// project has unsaved edits, and removed once it is saved or closed on
// purpose. At start, snapshots left by crashed Studios are offered back.
import { dialog, type BrowserWindow } from 'electron';
import type { AskPage } from './page-bridge.js';
import { RecoveryStore } from './recovery.js';

/** How often the page is asked whether the project changed, in milliseconds. */
const CHECK_EVERY = 1000;
/** A snapshot is written once edits pause this long... */
const QUIET_FOR = 2000;
/** ...or at least this often while they keep coming. */
const WRITE_AT_LEAST_EVERY = 10000;

/** Keeps this window's snapshot up to date, and offers back ones left by earlier crashes. */
export class RecoverySession {
  private timer: ReturnType<typeof setInterval> | undefined;
  private work: Promise<void> = Promise.resolve();
  private lastObserved = '';
  private lastSaved = '';
  private stableSince = 0;
  private lastWrite = Date.now();
  private stopped = false;

  constructor(
    private readonly win: BrowserWindow,
    private readonly store: RecoveryStore,
    private readonly askPage: AskPage,
  ) {}

  /** Offers back any snapshot left by a Studio that is no longer running, then starts keeping this one's. */
  async start() {
    try {
      await this.offerSnapshots();
    } catch (error) {
      await dialog.showMessageBox(this.win, {
        type: 'error',
        message: 'Could not restore recovery snapshot',
        detail: String(error),
      });
    }
    this.timer = setInterval(() => {
      this.work = this.work
        .then(() => this.tick())
        .catch((error) => {
          if (!this.win.isDestroyed())
            void this.askPage('status', 'Recovery snapshot failed: ' + String(error));
        });
    }, CHECK_EVERY);
  }

  /** Stops keeping snapshots and removes this window's, as it closes on purpose. */
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.work;
    await this.store.clear();
  }

  // Asks about each abandoned snapshot: Recover opens it as an unsaved project
  // (and stops asking), Discard removes it, Later leaves it for next time.
  private async offerSnapshots() {
    for (const name of await this.store.candidates()) {
      if (RecoveryStore.ownerRunning(name)) continue; // Leave running sessions' snapshots alone.
      const result = await dialog.showMessageBox(this.win, {
        type: 'question',
        message: 'Recover unsaved work?',
        detail:
          'A whole-project recovery snapshot was found. Recover opens it as an unsaved project. Your saved project file is unchanged.',
        buttons: ['Recover', 'Discard snapshot', 'Later'],
        defaultId: 0,
        cancelId: 2,
      });
      if (result.response === 2) continue;
      if (result.response === 1) {
        await this.store.remove(name);
        continue;
      }
      const project = await this.store.read(name);
      await this.askPage('recover', project);
      await this.store.save(project);
      await this.store.remove(name);
      break;
    }
  }

  // Writes a snapshot once the project has stopped changing, or has kept
  // changing for a while; removes it once the project is saved.
  private async tick() {
    if (this.stopped || this.win.isDestroyed()) return;
    const state = await this.askPage('snapshot');
    if (!state.dirty) {
      await this.store.clear();
      this.lastSaved = '';
      this.lastObserved = '';
      return;
    }
    const serialized = JSON.stringify(state.project),
      now = Date.now();
    if (serialized !== this.lastObserved) {
      this.lastObserved = serialized;
      this.stableSince = now;
    }
    if (
      serialized !== this.lastSaved &&
      (now - this.stableSince >= QUIET_FOR || now - this.lastWrite >= WRITE_AT_LEAST_EVERY)
    ) {
      await this.store.save(state.project);
      this.lastSaved = serialized;
      this.lastWrite = now;
    }
  }
}
