// Adding, deleting, copying and pasting memory slots.
import { builderSettings } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import { bu, edit, slots } from './model.js';

/** Adds a slot after the others, or a copy of `copy`, and selects it. */
export function addSlot(copy) {
  let n = 1;
  while (slots().some((s) => s.name === 'slot' + n)) n++;
  edit(copy ? 'Paste slot' : 'New slot', () => {
    const slot = copy
      ? { ...copy, name: 'slot' + n }
      : {
          name: 'slot' + n,
          mia: Math.max(
            0x14000,
            ...builderSettings.slots.filter((s) => s.mia !== undefined).map((s) => s.mia + s.size),
          ),
          size: 8192,
        };
    builderSettings.slots.push(slot);
    bu.selection = { slot: slot.name };
  });
}
/** Deletes the selected slot; false when no slot is selected. */
export function remove() {
  const slot = builderSettings.slots.find((s) => s.name === bu.selection?.slot);
  if (!slot) return false;
  edit('Delete slot', () => {
    builderSettings.slots = builderSettings.slots.filter((s) => s !== slot);
    bu.selection = null;
  });
  return true;
}
/** Copies the selected slot; false when no slot is selected. */
export function copy() {
  const s = builderSettings.slots.find((s) => s.name === bu.selection?.slot);
  if (!s) return false;
  StudioShell.clipboard.set('builderSlot', s);
  return true;
}
/** Pastes a copied slot; false when there is none. */
export function paste() {
  const s = StudioShell.clipboard.get('builderSlot');
  if (!s) return false;
  addSlot(s);
  return true;
}
