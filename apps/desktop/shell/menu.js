// Context menus, such as a library row's Rename, Duplicate and Delete.

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
