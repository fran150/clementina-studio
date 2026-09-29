// An asset library: the list of one kind of asset beside its editor, with New,
// Duplicate and Delete buttons and the same three actions on each row's
// right-click menu. Every library shares these rules, so they live here once:
//
// - New and Duplicate stop at the project's limit of 255 of a kind, with a
//   message saying so.
// - New waits, with a hint, while the editor is not ready (no tileset to draw
//   from yet, or the audio engine still loading).
// - New says what it created; Delete says what went and that Undo brings it
//   back.
//
// The editor supplies what differs: how an item is made, copied and removed
// (each as one undoable edit, named by the label it is given), and how a row
// is drawn and renamed.
import { canAdd } from '../domain/assets.js';
import { setStatus } from '../status.js';
import { iconButton } from './icons.js';
import { renderList } from './lists.js';

/**
 * @template {{ name: string }} T
 * @typedef {object} LibraryOptions
 * @property {string} noun One item, in lower case: 'sound'.
 * @property {string} plural Several items: 'sounds'.
 * @property {HTMLElement} list The list element the rows go in.
 * @property {() => T[]} items The items, in list order.
 * @property {() => number} index Which item is open.
 * @property {(i: number) => void} choose Opens item `i`, as a click on its row does.
 * @property {(i: number) => void} [select] Makes item `i` the open one before a
 *   row's Duplicate or Delete runs on it; `choose` when not given.
 * @property {() => void} render Redraws the editor.
 * @property {(i: number, name: string) => any} [rename] Renames item `i`.
 * @property {number} [maxLength] The rename field's length limit.
 * @property {(row: HTMLElement, item: T) => void} [content] Draws a row's body.
 * @property {boolean} [limited] Whether the 255 limit applies (default true).
 * @property {{ rail?: HTMLElement, create: string, duplicate: string,
 *   remove: string, empty?: string }} buttons The buttons' ids. With `rail`,
 *   the three buttons are made and added to it; otherwise they are already in
 *   the page. `empty` is the empty editor's own New button.
 * @property {() => string | null} [ready] A hint when New cannot run yet.
 * @property {(label: string) => void} create Adds a new item, as one edit.
 * @property {(item: T, label: string) => void} copy Adds a copy, as one edit.
 * @property {(item: T, label: string) => void} remove Deletes an item.
 * @property {(item: T) => string | null} [removable] A hint when `item` cannot
 *   be deleted.
 * @property {(item: T) => string} [created] The message after New.
 * @property {(item: T) => string} [copied] The message after Duplicate.
 * @property {(item: T) => string | null} [deleted] The message after Delete;
 *   null leaves the status to `remove`.
 */

/**
 * Wires an asset library's buttons and returns what draws its list.
 * @template {{ name: string }} T
 * @param {LibraryOptions<T>} options
 * @returns {{ render(): void }}
 */
export function assetLibrary(options) {
  const { noun, plural, items, index, buttons, limited = true } = options;
  const $ = (id) => document.getElementById(id);
  const current = () => items()[index()];
  const select = options.select ?? options.choose;
  if (buttons.rail)
    buttons.rail.append(
      iconButton(buttons.create, 'New ' + noun, 'newItem'),
      iconButton(buttons.duplicate, 'Duplicate ' + noun, 'duplicate'),
      iconButton(buttons.remove, 'Delete ' + noun, 'delete'),
    );
  /** False, with the reason on the status line, when the list is full. */
  const roomFor = () => {
    if (!limited || canAdd(items())) return true;
    setStatus(`A project holds at most 255 ${plural}.`);
    return false;
  };

  const create = () => {
    if (!roomFor()) return;
    const hint = options.ready?.();
    if (hint) {
      setStatus(hint);
      return;
    }
    options.create('New ' + noun);
    setStatus(options.created?.(current()) ?? `Created ${current().name}.`);
  };
  const duplicate = () => {
    const item = current();
    if (!item || !roomFor()) return;
    options.copy(item, 'Duplicate ' + item.name);
    if (options.copied) setStatus(options.copied(item));
  };
  const remove = () => {
    const item = current();
    if (!item) return;
    const hint = options.removable?.(item);
    if (hint) {
      setStatus(hint);
      return;
    }
    const message = options.deleted
      ? options.deleted(item)
      : `Deleted ${item.name}. Ctrl/Cmd+Z brings it back.`;
    if (message) setStatus(message);
    options.remove(item, 'Delete ' + item.name);
  };
  $(buttons.create).onclick = create;
  $(buttons.duplicate).onclick = duplicate;
  $(buttons.remove).onclick = remove;
  if (buttons.empty) $(buttons.empty).onclick = create;

  return {
    render() {
      renderList(options.list, items(), {
        selected: (item, i) => i === index(),
        choose: (item, i) => options.choose(i),
        rename: options.rename,
        render: options.render,
        maxLength: options.maxLength,
        content: options.content,
        duplicate: (item, i) => {
          select(i);
          duplicate();
        },
        remove: (item, i) => {
          select(i);
          remove();
        },
      });
    },
  };
}
