// The palette dock: the sixteen banks of palette RAM as the active config
// arranges them, the chosen color, bank usage marks, and copy and paste of
// a color.
import { $ } from '../dom.js';
import {
  activeConfig,
  bankColor,
  bankPalette,
  css565,
  css565ToInput,
  setBankColor,
} from '../state.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { icon } from './icons.js';
import { asset, mutate, tl } from './model.js';

const host = $('tilesetEditor');
/** Shows the chosen color and which banks the tileset uses. */
export function refreshPalettes() {
  const a = asset();
  if (!a) return;
  ensureBankRows();
  // 1bpp tiles carry colors 0 and 1 only, whichever bank they name.
  const limit = a.bpp === 1 ? 1 : 7;
  if (tl.ink > limit) tl.ink = 1;
  $('bankSwatches')
    .querySelectorAll('button[data-ink]')
    .forEach((button) => {
      const p = Number(button.dataset.palette),
        i = Number(button.dataset.ink);
      button.style.background =
        i === 0 && !tl.zeroAsColor
          ? 'linear-gradient(135deg,white 43%,#e32636 44%,#e32636 56%,white 57%)'
          : css565(bankColor(p, i));
      button.classList.toggle('chosenColor', p === tl.palette && i === tl.ink);
      button.disabled = i > limit;
      button.title =
        i === 0 && !tl.zeroAsColor
          ? 'Color 0 — transparent for sprites and the overlay, drawn on background cells'
          : `${bankPalette(p)?.name ?? 'Empty bank'} · color ${i}`;
      button.setAttribute('aria-label', button.title);
    });
  // The bank’s palette name is on the row itself now that no button carries it.
  const used = new Set(a.tilePaletteBanks);
  $('bankSwatches').classList.add('bankSwatches');
  $('bankSwatches')
    .querySelectorAll('.paletteGroup')
    .forEach((row) => {
      const bank = Number(row.dataset.palette);
      row.classList.toggle('hoverBank', tl.hovering && bank === a.tilePaletteBanks[tl.targetTile]);
      row.classList.toggle('chosenBank', bank === tl.palette);
      row.classList.toggle('usedBank', used.has(bank));
      row.classList.toggle('usageSource', bank === tl.usagePalette);
      row.title = `Bank ${String(bank).padStart(2, '0')} · ${bankPalette(bank)?.name ?? 'empty in "' + activeConfig().name + '"'}`;
    });
  $('copyColor').disabled = tl.ink === 0;
  $('pasteColor').disabled = !StudioShell.clipboard.has('color') || tl.ink === 0;
}
// The dock shows palette RAM as the active config arranges it: sixteen banks,
// fixed. Nothing binds a palette to this tileset, so a tile simply records the
// bank number it was drawn against and recolors when another config loads.
function bankRow(b) {
  const group = document.createElement('div');
  group.className = 'paletteGroup';
  group.dataset.palette = b;
  const label = document.createElement('span');
  label.textContent = String(b).padStart(2, '0');
  group.append(label);
  for (let i = 0; i < 8; i++) {
    const button = document.createElement('button');
    button.dataset.palette = b;
    button.dataset.ink = String(i);
    button.onclick = () => {
      tl.clipboardArea = 'color';
      tl.palette = b;
      tl.ink = i;
      refreshPalettes();
    };
    const editColor = () => {
      if (i === 0 && !tl.zeroAsColor) return;
      tl.colorEdit = { bank: b, ink: i };
      $('bankColor').value = css565ToInput(bankColor(b, i));
      $('bankColor').click();
    };
    button.ondblclick = editColor;
    button.oncontextmenu = (e) => {
      e.preventDefault();
      button.click();
      const editable = i > 0 || tl.zeroAsColor;
      StudioShell.contextMenu(e.clientX, e.clientY, [
        {
          label: 'Copy color',
          hint: 'Mod+C',
          disabled: i === 0,
          run: () => $('copyColor').click(),
        },
        {
          label: 'Paste color',
          hint: 'Mod+V',
          disabled: i === 0 || !StudioShell.clipboard.has('color'),
          run: () => $('pasteColor').click(),
        },
        '-',
        { label: 'Edit color…', disabled: !editable, run: editColor },
      ]);
    };
    group.append(button);
  }
  // Hovering a bank marks every tile drawn against it, so it is visible what
  // repointing the bank would recolor.
  const mark = () => {
    tl.usagePalette = b;
    tl.render();
  };
  const clear = (e) => {
    if (e && group.contains(e.relatedTarget)) return;
    tl.usagePalette = null;
    tl.render();
  };
  group.onmouseenter = mark;
  group.onmouseleave = clear;
  group.addEventListener('focusin', mark);
  group.addEventListener('focusout', clear);
  return group;
}
/** Builds the sixteen bank rows once. */
function ensureBankRows() {
  const host = $('bankSwatches');
  if (host.querySelectorAll('.paletteGroup').length === 16) return;
  host.replaceChildren(...Array.from({ length: 16 }, (_, b) => bankRow(b)));
}

/** Adds the dock's Copy color and Paste color buttons. */
export function colorClipboard() {
  const colorActions = document.createElement('div');
  colorActions.className = 'colorClipboard';
  for (const [id, name, label, fn] of /** @type {[string, string, string, () => void][]} */ ([
    [
      'copyColor',
      'copy',
      'Copy selected color',
      () => {
        if (!asset() || tl.ink === 0) return;
        StudioShell.clipboard.set('color', bankColor(tl.palette, tl.ink));
        tl.clipboardArea = 'color';
        setStatus('Color copied. Choose another swatch, then Paste color.');
        refreshPalettes();
      },
    ],
    [
      'pasteColor',
      'paste',
      'Paste color into selected swatch',
      () => {
        if (!asset() || tl.ink === 0 || !StudioShell.clipboard.has('color')) return;
        mutate('Paste a color', () =>
          setBankColor(tl.palette, tl.ink, StudioShell.clipboard.get('color')),
        );
        tl.clipboardArea = 'color';
      },
    ],
  ])) {
    const button = document.createElement('button');
    button.id = id;
    icon(button, name, label);
    button.onclick = fn;
    colorActions.append(button);
  }
  const note = document.createElement('span');
  note.textContent = 'Copy / paste color';
  colorActions.append(note);
  host.querySelector('.paletteDockHead').append(colorActions);
}
