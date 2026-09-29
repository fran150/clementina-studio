// The palette list: new, duplicate, rename and delete. Deleting a palette
// that banks use asks which palette takes its place in them.
import { graphicsEdit } from '../bank-editor.js';
import { $ } from '../dom.js';
import { repointBanks } from '../domain/palettes.js';
import {
  createPalette,
  css565,
  libraryPalette,
  paletteConfigs,
  paletteLibrary,
  RAINBOW_565,
  uniquePaletteName,
} from '../state.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { palette, pl, usage } from './model.js';

const iconButton = (id, label, icon) => StudioShell.iconButton(id, label, icon);
const dialog = $('palDeleteDialog');
/** Repoints every bank of every config from one palette to another. */
function repoint(fromId, toId) {
  return repointBanks(paletteConfigs, fromId, toId);
}
/** Clears a palette out of every bank, for a delete with no replacement. */
function unbind(id) {
  return repointBanks(paletteConfigs, id, null);
}
/** Asks how to delete the open palette, then deletes it. */
export function destroy() {
  const target = palette();
  if (!target) return;
  if (paletteLibrary.length === 1) {
    setStatus('A project keeps at least one palette.');
    return;
  }
  const used = usage(target.id),
    inUse = used.length > 0;
  $('palDeleteSummary').hidden = inUse;
  $('palDeleteSummary').textContent = inUse
    ? ''
    : `"${target.name}" is not in any bank of any config.`;
  $('palReplacementRow').hidden = !inUse;
  const others = paletteLibrary.filter((p) => p !== target);
  $('palReplacement').replaceChildren(
    ...others.map((p) => new Option(p.name, p.id)),
    new Option('Leave those banks empty', '__empty'),
  );
  $('palReplacement').value = (others[pl.index - 1] ?? others[0]).id;
  $('palDeleteConfirm').onclick = () => {
    const choice = inUse ? $('palReplacement').value : null,
      replacement = choice === '__empty' ? null : choice;
    dialog.close();
    graphicsEdit(
      'Delete ' + target.name,
      () => {
        const moved = replacement
          ? repoint(target.id, replacement)
          : choice
            ? unbind(target.id)
            : 0;
        paletteLibrary.splice(paletteLibrary.indexOf(target), 1);
        pl.index = Math.min(pl.index, paletteLibrary.length - 1);
        setStatus(
          !choice
            ? 'Deleted ' + target.name + '.'
            : replacement
              ? `Deleted ${target.name}. Moved ${moved} palette bank${moved === 1 ? '' : 's'} onto ${libraryPalette(replacement).name}.`
              : `Deleted ${target.name}. Emptied ${moved} palette bank${moved === 1 ? '' : 's'}.`,
        );
      },
      true,
    );
    pl.render();
  };
  dialog.showModal();
}
/** Renames palette `i`; false (with a hint) when the name is empty or taken. */
export function renamePalette(i, name) {
  if (!name) return false;
  if (paletteLibrary.some((p, j) => j !== i && p.name.toLowerCase() === name.toLowerCase())) {
    setStatus('Use a unique palette name.');
    return false;
  }
  graphicsEdit('Rename a palette', () => (paletteLibrary[i].name = name));
  return true;
}
/** Draws the palette list, each row with its colors. */
export function renderPaletteList() {
  StudioShell.renderList($('palList'), paletteLibrary, {
    selected: (entry, i) => i === pl.index,
    choose: (entry, i) => {
      pl.index = i;
      pl.render();
    },
    rename: renamePalette,
    render: pl.render,
    maxLength: 48,
    duplicate: (entry, i) => {
      pl.index = i;
      $('palDuplicate').click();
    },
    remove: (entry, i) => {
      pl.index = i;
      $('palDelete').click();
    },
    content: (row, entry) => {
      row.classList.toggle('unusedPalette', !usage(entry.id).length);
      // Reused in place, not recreated, so a click-triggered render happening
      // between the two clicks of a double-click does not swap out the node
      // under the pointer — swapping it resets the browser's dblclick count.
      let [name, chips] = row.children;
      if (!name || !chips) {
        name = document.createElement('span');
        chips = document.createElement('span');
        chips.className = 'rowChips';
        row.replaceChildren(name, chips);
      }
      name.textContent = entry.name;
      while (chips.children.length > entry.colors.length) chips.lastElementChild.remove();
      entry.colors.forEach((color, ci) => {
        let chip = chips.children[ci];
        if (!chip) {
          chip = document.createElement('i');
          chips.append(chip);
        }
        chip.style.background = css565(color);
      });
    },
  });
}

/** Adds the list's New, Duplicate and Delete buttons and the delete dialog's Cancel. */
export function libraryActions() {
  for (const [id, label, path, fn] of [
    [
      'palNew',
      'New palette',
      'newItem',
      () => {
        graphicsEdit('New palette', () => {
          createPalette(RAINBOW_565);
          pl.index = paletteLibrary.length - 1;
        });
        setStatus('Added a palette. Bind it from a bank slot to use it.');
        pl.render();
      },
    ],
    [
      'palDuplicate',
      'Duplicate palette',
      'duplicate',
      () => {
        graphicsEdit('Duplicate ' + palette().name, () => {
          createPalette(palette().colors, uniquePaletteName());
          pl.index = paletteLibrary.length - 1;
        });
        setStatus('Duplicated the palette.');
        pl.render();
      },
    ],
    ['palDelete', 'Delete palette', 'delete', () => destroy()],
  ]) {
    const button = iconButton(id, label, path);
    button.onclick = fn;
    $('palListActions').append(button);
  }
  $('palDeleteCancel').onclick = () => dialog.close();
}
