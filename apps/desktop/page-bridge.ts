// Questions the main process asks the page, about what only the page knows,
// such as the current project. A question goes out on studio:request with an
// id, and the page answers on studio:response with the same id (see
// onRequest in preload.cts).
import { ipcMain, type BrowserWindow } from 'electron';
import type { StudioProject } from '../../packages/assets/index.js';

/** Each question the page answers: [its argument, its answer]. */
type PageRequests = {
  snapshot: [undefined, { dirty: boolean; project: StudioProject }];
  projectJson: [undefined, string];
  recover: [StudioProject, void];
  status: [string, void];
};

/** Asks the page a question and resolves with its answer. */
export type AskPage = <K extends keyof PageRequests>(
  name: K,
  ...arg: PageRequests[K][0] extends undefined ? [] : [PageRequests[K][0]]
) => Promise<PageRequests[K][1]>;

/** Listens for the page's answers and returns the function that asks `win`'s page. */
export function pageBridge(win: BrowserWindow): AskPage {
  const replies = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let lastId = 0;
  ipcMain.on('studio:response', (_event, id: number, error: string | null, value: unknown) => {
    const reply = replies.get(id);
    if (!reply) return;
    replies.delete(id);
    if (error === null) reply.resolve(value);
    else reply.reject(new Error(error));
  });
  return (name, ...arg) => {
    const id = ++lastId;
    return new Promise((resolve, reject) => {
      replies.set(id, { resolve: resolve as (value: unknown) => void, reject });
      win.webContents.send('studio:request', id, name, arg[0]);
    });
  };
}
