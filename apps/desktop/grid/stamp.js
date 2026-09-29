// The grid editors' stamp settings: the bar that shows what the next paint
// lays down (or, with cells selected, what the flips and banks act on), the
// flip, Priority and bank-reset buttons, and the palette dock.
import { bankColor, bankPalette, css565 } from '../state.js';
import { StudioShell } from '../studio-shell.js';

/**
 * Wires up the stamp settings of one grid editor.
 *
 * @param {any} ed The editor's shared state and helpers (see grid-editor.js).
 */
export function stampControls(ed) {
  const { el, selection, transparentZero } = ed;

  // Shows the stamp (or, with cells selected, what the flips and bank act on).
  function updateStampBar() {
    const stamp = ed.stamp,
      group = ed.isGroup(),
      sel = selection.rect;
    el('StampTile').textContent = String(stamp.tile);
    el('GroupLabel').hidden = !group;
    el('GroupLabel').textContent =
      `Group ${ed.pickRegion.width} × ${ed.pickRegion.height} — each tile keeps its own bank`;
    el('SelectionLabel').hidden = !sel;
    if (sel)
      el('SelectionLabel').textContent =
        `Selected ${sel.width} × ${sel.height} — flips, Priority and a palette bank edit these tiles in place`;
    el('SelectionClear').hidden = !sel;
    // With a selection the flips and Priority act on it; otherwise they are
    // the next stamp's settings, shown pressed when on.
    el('FlipX').classList.toggle('on', !sel && stamp.flipX);
    el('FlipY').classList.toggle('on', !sel && stamp.flipY);
    el('Priority').classList.toggle('on', !sel && stamp.priority);
    el('StampSource').textContent = stamp.chrAlt ? 'Reads: Alternate' : 'Reads: Primary';
    const authored = ed.cellTileset(stamp)?.tilePaletteBanks?.[stamp.tile];
    el('BankLabel').textContent =
      group && !sel ? '' : 'Bank ' + String(stamp.paletteBank).padStart(2, '0');
    el('BankReset').hidden = sel
      ? false
      : group || authored === undefined || authored === stamp.paletteBank;
  }
  // Changes the next stamp and redraws.
  function setStamp(change) {
    ed.stamp = { ...ed.stamp, ...change };
    ed.render();
  }
  // With a selection these edit the selected cells, as one undo step: a flip
  // turns the selected block over, Priority turns on for all of them unless
  // all have it already. Otherwise they set up the next stamp.
  el('FlipX').onclick = () => {
    if (selection.rect) selection.flip('x');
    else setStamp({ flipX: !ed.stamp.flipX });
  };
  el('FlipY').onclick = () => {
    if (selection.rect) selection.flip('y');
    else setStamp({ flipY: !ed.stamp.flipY });
  };
  el('Priority').onclick = () => {
    if (selection.rect) {
      const on = !selection.selected().every((c) => c.priority);
      selection.apply((c) => (c.priority = on), on ? 'Set priority' : 'Clear priority');
    } else setStamp({ priority: !ed.stamp.priority });
  };
  // Puts the stamp, or the selected cells, back in their tiles' authored banks.
  el('BankReset').onclick = () => {
    if (selection.rect) {
      selection.apply((cell) => {
        const source = ed.cellTileset(cell);
        if (source) cell.paletteBank = source.tilePaletteBanks[cell.tile];
      }, 'Reset palette banks');
      return;
    }
    const source = ed.cellTileset(ed.stamp);
    if (source) ed.stamp = { ...ed.stamp, paletteBank: source.tilePaletteBanks[ed.stamp.tile] };
    ed.render();
  };
  el('SelectionClear').onclick = () => selection.deselect();

  // Each bank is a full 8-color palette, not one representative color, so
  // two banks that differ past color 1 still look different. Clicking a
  // bank's row picks it for the stamp, or sets the selected cells to it.
  function renderPaletteDock() {
    StudioShell.bankDock(el('Swatches'), (b) => {
      if (selection.rect) selection.apply((cell) => (cell.paletteBank = b), `Set bank ${b}`);
      else setStamp({ paletteBank: b });
    });
    // A picked group has no single bank to set, unless cells are selected,
    // which a bank click then sets whatever is picked.
    const sel = selection.rect,
      group = !sel && ed.isGroup();
    StudioShell.syncBankDock(el('Swatches'), {
      color: (b, i) => css565(bankColor(b, i)),
      transparentZero,
      chosen: group || sel ? null : ed.stamp.paletteBank,
      used: new Set(ed.grid().cells.map((c) => c.paletteBank)),
      disabled: group,
      title: (b) =>
        group
          ? "A group keeps each tile's own authored bank"
          : sel
            ? `Set the selected tiles to bank ${String(b).padStart(2, '0')} · ${bankPalette(b)?.name ?? 'empty'}`
            : `Bank ${String(b).padStart(2, '0')} · ${bankPalette(b)?.name ?? 'empty'}`,
    });
  }

  return { updateStampBar, renderPaletteDock };
}
