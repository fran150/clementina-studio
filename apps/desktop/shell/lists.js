// A selectable, optionally renameable list of named items — the palette,
// tileset, composition, background, overlay, placeholder, animation and
// shape libraries are all one of these. Rows are reused in place rather
// than recreated so a render triggered mid-double-click does not swap the
// node out from under the pointer, which would reset the browser's
// dblclick count.
//
// options: {
//   selected(item,i) -> boolean   which row shows as selected
//   choose(item,i)                click / Enter
//   rename(i,newName) -> any      optional; enables dblclick / F2 rename
//   render()                      re-render, called once a rename commits, is
//                                 cancelled or is rejected — required when
//                                 `rename` is given
//   content(row,item)             optional custom row body; defaults to
//                                 `row.textContent = item.name`
//   maxLength                     rename input's maxlength, default 48
//   duplicate(item,i), remove(item,i)
//                                 optional; offered with Rename on the row's
//                                 right-click menu, remove also on Delete
// }
//
// renderOptions draws a plain listbox; startRename is the inline rename
// form both use.
import { contextMenu } from './menu.js';

// A listbox of plain rows, one per item, reusing the rows already there.
// Clicking a row or pressing Enter on it chooses its item.
/**
 * @template T
 * @param {HTMLElement} list
 * @param {T[]} items
 * @param {{ label: (item: T) => string, selected: (item: T) => boolean,
 *   choose: (item: T) => void }} options
 */
export function renderOptions(list, items, { label, selected, choose }) {
  while (list.children.length > items.length) list.lastElementChild.remove();
  items.forEach((item, i) => {
    let row = /** @type {HTMLElement} */ (list.children[i]);
    if (!row) {
      row = document.createElement('div');
      row.className = 'assetRow';
      row.tabIndex = 0;
      row.setAttribute('role', 'option');
      list.append(row);
    }
    row.textContent = label(item);
    row.setAttribute('aria-selected', String(selected(item)));
    row.onclick = () => choose(item);
    row.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(item);
      }
    };
  });
}
export function renderList(container, items, options) {
  const { selected, choose, rename, render, content, maxLength = 48, duplicate, remove } = options;
  while (container.children.length > items.length) container.lastElementChild.remove();
  items.forEach((item, i) => {
    let row = container.children[i];
    if (!row) {
      row = document.createElement('div');
      row.className = 'assetRow';
      row.tabIndex = 0;
      row.setAttribute('role', 'option');
      container.append(row);
    }
    row.dataset.index = i;
    row.setAttribute('aria-selected', String(selected(item, i)));
    if (!row.querySelector('input')) {
      if (content) content(row, item);
      else row.textContent = item.name;
    }
    row.onclick = (e) => {
      if (e.target.tagName !== 'INPUT') choose(item, i);
    };
    row.ondblclick = rename
      ? (e) => {
          if (e.target.tagName !== 'INPUT')
            startRename(container, i, item.name, rename, render, maxLength);
        }
      : null;
    row.onkeydown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(item, i);
      }
      if (rename && e.key === 'F2') {
        e.preventDefault();
        startRename(container, i, item.name, rename, render, maxLength);
      }
      if (remove && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        remove(item, i);
      }
    };
    row.oncontextmenu =
      rename || duplicate || remove
        ? (e) => {
            if (e.target.tagName === 'INPUT') return;
            e.preventDefault();
            contextMenu(
              e.clientX,
              e.clientY,
              [
                rename && {
                  label: 'Rename',
                  hint: 'F2',
                  run: () => startRename(container, i, item.name, rename, render, maxLength),
                },
                duplicate && { label: 'Duplicate', run: () => duplicate(item, i) },
                remove && { label: 'Delete', hint: 'Delete', run: () => remove(item, i) },
              ].filter(Boolean),
            );
          }
        : null;
  });
}

// The one piece every rename form needs to get right: the input this
// creates must be gone from the row — via the unconditional `render()` at
// the end of `finish` — whether the rename is saved, cancelled, or
// rejected by `rename` itself. Leaving it in place is what let a rename
// get permanently stuck as a textbox.
export function startRename(container, i, name, rename, render, maxLength = 48) {
  const row = container.children[i];
  if (!row || row.querySelector('input')) return;
  const input = document.createElement('input');
  input.value = name;
  input.maxLength = maxLength;
  input.setAttribute('aria-label', 'Rename ' + name);
  row.replaceChildren(input);
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    row.textContent = name;
    if (save && value !== name) rename(i, value);
    render();
  };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };
  input.onblur = () => finish(true);
  input.focus();
  input.select();
}
