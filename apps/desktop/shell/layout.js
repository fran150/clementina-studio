// The pieces every editor's layout is built from: tool rails, dockable
// panels with their toggles, the empty-editor state, each editor's status
// line, and the tab bar with the project's file actions.
import { $ } from '../dom.js';
import { currentView } from '../state.js';
import { iconButton, setIcon } from './icons.js';

/** A new tool rail: a <nav> on the left, or on the right when `side` is 'right'. */
export function toolRail(id, label, side = 'left') {
  const rail = document.createElement('nav');
  rail.id = id;
  rail.className = 'studioToolRail' + (side === 'right' ? ' studioRightRail' : '');
  rail.setAttribute('aria-label', label);
  return rail;
}
// Every rail reads the same way: groups separated by a rule — panel
// toggles, then tools — and edit actions (copy, paste, undo, redo) pinned
// to the bottom. A right rail holds the selection's panels and transforms.
export function railLayout(rail, groups, actions = []) {
  const children = [];
  for (const group of groups.filter((g) => g.length)) {
    if (children.length) children.push(document.createElement('hr'));
    children.push(...group);
  }
  const spacer = document.createElement('div');
  spacer.className = 'railSpacer';
  rail.replaceChildren(...children, spacer, ...actions);
}
const panels = new Map();
// asset: the dock shows a part of the open asset (its map, the tiles it
// draws from, its properties) rather than the list of assets, so it steps
// aside while the editor has nothing open (see emptyEditor).
/**
 * @param {{ panel: HTMLElement, button: HTMLElement, closeId?: string, closeClass?: string,
 *   group?: string, closeGroups?: string[], asset?: boolean }} options
 */
export function bindPanel({
  panel,
  button,
  closeId = button.id + 'Close',
  closeClass = 'panelClose',
  group,
  closeGroups = [],
  asset = false,
}) {
  if (!panel.id) panel.id = button.id + 'Panel';
  if (asset) {
    panel.classList.add('studioAssetDock');
    button.classList.add('studioAssetDockToggle');
  }
  button.setAttribute('aria-controls', panel.id);
  const setOpen = (open, restoreFocus = false) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open && restoreFocus) button.focus();
  };
  const close = iconButton(closeId, 'Close panel', 'close');
  close.className = closeClass;
  close.onclick = () => setOpen(false, true);
  panel.prepend(close);
  button.onclick = () => {
    const open = panel.hidden;
    if (open)
      for (const other of panels.values())
        if (other.panel !== panel && closeGroups.includes(other.group)) other.setOpen(false);
    setOpen(open);
  };
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false, true);
    }
  });
  panels.set(panel, { panel, button, group, setOpen });
  setOpen(!panel.hidden);
  return { setOpen };
}
// An editor with nothing open shows only its empty state and the list of
// assets: the asset's own docks hide, keeping whether they were open for
// when there is something to show, and their buttons are disabled.
export function emptyEditor(host, empty) {
  host.classList.toggle('studioIsEmpty', empty);
  for (const b of host.querySelectorAll('.studioAssetDockToggle')) b.disabled = empty;
}
// Each editor's status line — sizes, counts, what is under the pointer —
// shows in the one status bar, beside the app's messages.
export const viewStatuses = new Map();
export function viewStatus(view, element) {
  viewStatuses.set(view, element);
  $('viewStatus').append(element);
  element.hidden = view !== currentView;
}
/** Marks `view`'s tab as current and shows its status line. */
export function selectView(view) {
  document.body.classList.add('studioWorkspace');
  for (const [key, element] of viewStatuses) element.hidden = key !== view;
  document.querySelectorAll('#workflowNav [data-view]').forEach((button) => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

/** Moves the project's file buttons, with their icons, and the bank config
 * picker into the editor tabs, and labels the tabs and status bar. */
export function mountNavigation() {
  const projectIcons = {
    newFile: '<path d="M5 2h11l5 5v17H5zM16 2v6h5M9 15h8M13 11v8"/>',
    openFile: '<path d="M3 7h8l2 3h9v3H7L3 23V7zM3 23h17l4-10H7"/>',
    saveFile: '<path d="M3 3h17l3 3v17H3zM7 3v7h11V3M7 23v-9h12v9M15 5v3"/>',
    saveAs: '<path d="M3 3h16l3 3v6M3 3v20h8M7 3v7h10V3M7 20v-6h6M14 20l7-7 3 3-7 7-4 1z"/>',
  };
  for (const [id, name, label] of [
    ['newBtn', 'newFile', 'New project (Ctrl/Cmd+N)'],
    ['nativeOpen', 'openFile', 'Open project… (Ctrl/Cmd+O)'],
    ['nativeSave', 'saveFile', 'Save project (Ctrl/Cmd+S)'],
    ['nativeSaveAs', 'saveAs', 'Save project as… (Ctrl/Cmd+Shift+S)'],
  ]) {
    setIcon($(id), projectIcons[name], label, { size: 30, viewBox: '0 0 26 26' });
    $(id).classList.add('projectIcon');
  }
  $('nativeOpen').before($('newBtn'));
  // The project's file actions sit at the end of the editor tabs, which frees
  // the row they used to fill below them.
  const projectActions = document.createElement('div');
  projectActions.className = 'navProject';
  projectActions.append($('newBtn'), $('nativeOpen'), $('nativeSave'), $('nativeSaveAs'));
  // The bank config every editor previews with is one global choice, so it
  // sits with the tabs rather than in each editor.
  $('workflowNav').append($('configPickerWrap'), projectActions);
  document.querySelector('#workflowNav')?.setAttribute('aria-label', 'Editors');
  const status = document.querySelector('#status');
  status?.setAttribute('role', 'status');
  status?.setAttribute('aria-live', 'polite');
}
