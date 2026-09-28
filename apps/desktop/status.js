// The status line, the unsaved-changes mark and the window title, and the
// project file they name.
import { $ } from './dom.js';

const statusEl = $('status'),
  dirtyEl = $('dirty'),
  nameInput = $('nameInput');

export let dirty = false,
  projectFile = null;
export const setDirty = (v) => (dirty = v);
export const setProjectFile = (v) => (projectFile = v);

export function setStatus(s) {
  statusEl.textContent = s;
}
export function markDirty() {
  dirty = true;
  setDirtyLabel();
}
export function setDirtyLabel() {
  dirtyEl.className = dirty ? 'dirty' : '';
  dirtyEl.textContent = dirty ? '● unsaved changes' : '';
  updateTitle();
}
// The window shows the project's file, and whether it has unsaved edits the
// way macOS does: "— Edited" in the title and the dot in the close button.
export function updateTitle() {
  document.title =
    (projectFile ?? 'Untitled') + (dirty ? ' — Edited' : '') + ' — Clementina Studio';
  window.studio?.edited?.(dirty);
}
export function baseName() {
  return (nameInput.value.trim() || 'tiles').replace(/[^\w.-]+/g, '_');
}
export function setNameFromFile(name) {
  nameInput.value = (name || '').replace(/\.[^/.]+$/, '') || 'tiles';
  projectFile = name || null;
}
