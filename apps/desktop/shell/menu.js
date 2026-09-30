// Context menus, such as a library row's Rename, Duplicate and Delete.
import { clipboard } from './clipboard.js';

// Shortcut hints the way each platform writes them: ⌘C on a Mac, Ctrl+C
// elsewhere. A spec says Mod+ for Ctrl/Cmd.
const MAC = /Mac/.test(navigator.platform);
const keyHint = (spec) =>
  MAC
    ? spec.replace('Mod+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥')
    : spec.replace('Mod+', 'Ctrl+');
let openMenu = null;
function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}
// Opens a small menu at (x, y), closing any other: items are {label, hint,
// run, disabled}, and '-' draws a separator. It closes on a choice, Escape,
// a click elsewhere or scrolling, and is keyboard-navigable.
export function contextMenu(x, y, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'studioMenu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item === '-') {
      menu.append(document.createElement('hr'));
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.disabled = !!item.disabled;
    b.append(
      Object.assign(document.createElement('span'), { textContent: item.label }),
      Object.assign(document.createElement('kbd'), { textContent: keyHint(item.hint ?? '') }),
    );
    b.onclick = () => {
      closeMenu();
      item.run();
    };
    menu.append(b);
  }
  menu.onkeydown = (e) => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')],
      at = buttons.indexOf(/** @type {StudioElement} */ (document.activeElement));
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
  };
  document.body.append(menu);
  openMenu = menu;
  menu.style.left = Math.min(x, innerWidth - menu.offsetWidth - 6) + 'px';
  menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 6) + 'px';
  menu.querySelector('button:not(:disabled)')?.focus();
}

/** Closes an open menu on a click elsewhere, on scrolling or when the window loses focus. */
export function installMenuDismiss() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (openMenu && !openMenu.contains(e.target)) closeMenu();
    },
    true,
  );
  window.addEventListener('blur', closeMenu);
  document.addEventListener('scroll', closeMenu, true);
}

/**
 * @typedef {object} EditMenuCommands
 * @property {boolean} selected Whether anything is selected; the commands that
 *   act on the selection are disabled without one.
 * @property {string} kind The clipboard kind Paste takes: 'pixels', 'cells'.
 * @property {() => void} cut
 * @property {() => void} copy
 * @property {() => void} paste
 * @property {string} [pasteLabel] Paste's label, when it says where: 'Paste at the cursor'.
 * @property {() => void} [duplicate] Adds Duplicate (Mod+D) before Delete.
 * @property {() => void} remove
 * @property {(axis: 'x' | 'y') => void} [flip] Adds Flip horizontally (Shift+H)
 *   and Flip vertically (Shift+V).
 * @property {object[]} [transform] Items after the flips, such as Rotate 90°.
 * @property {object[]} [arrange] A group of its own before Select all.
 * @property {() => void} selectAll
 * @property {() => void} [deselect] Adds Deselect (Esc) after Select all.
 */

/**
 * Opens a canvas's right-click edit menu at the pointer. Every canvas shares
 * the same items, in the same order and with the same shortcuts: Cut, Copy,
 * Paste, Delete, the flips, Select all and Deselect. An editor adds its own
 * extras through `duplicate`, `transform` and `arrange`.
 * @param {MouseEvent} e The contextmenu event.
 * @param {EditMenuCommands} c
 */
export function editMenu(e, c) {
  const off = !c.selected;
  /** @type {any[]} */
  const items = [
    { label: 'Cut', hint: 'Mod+X', disabled: off, run: c.cut },
    { label: 'Copy', hint: 'Mod+C', disabled: off, run: c.copy },
    {
      label: c.pasteLabel ?? 'Paste',
      hint: 'Mod+V',
      disabled: !clipboard.has(c.kind),
      run: c.paste,
    },
  ];
  if (c.duplicate)
    items.push({ label: 'Duplicate', hint: 'Mod+D', disabled: off, run: c.duplicate });
  items.push({ label: 'Delete', hint: 'Delete', disabled: off, run: c.remove }, '-');
  if (c.flip)
    items.push(
      { label: 'Flip horizontally', hint: 'Shift+H', disabled: off, run: () => c.flip('x') },
      { label: 'Flip vertically', hint: 'Shift+V', disabled: off, run: () => c.flip('y') },
    );
  items.push(...(c.transform ?? []), '-');
  if (c.arrange) items.push(...c.arrange, '-');
  items.push({ label: 'Select all', hint: 'Mod+A', run: c.selectAll });
  if (c.deselect) items.push({ label: 'Deselect', hint: 'Esc', disabled: off, run: c.deselect });
  contextMenu(e.clientX, e.clientY, items);
}
