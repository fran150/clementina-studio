// The open palette's eight colors: each swatch opens the color input, and
// right-click copies, pastes or edits one color.
import { $ } from '../dom.js';
import { css565, css565ToInput, inputTo565 } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import { palette, paletteEdit, pl } from './model.js';

const host = $('paletteWorkspace');

/** Draws the eight color cells for `entry`, building them the first time. */
export function renderColors(entry) {
  const colors = $('palColors');
  for (let ink = 0; ink < 8; ink++) {
    let cell = colors.children[ink];
    if (!cell) {
      cell = document.createElement('div');
      cell.className = 'palColor';
      const swatch = document.createElement('button');
      swatch.dataset.ink = String(ink);
      const label = document.createElement('span');
      label.className = 'palIndex';
      label.textContent = ink === 0 ? '0 · key' : String(ink);
      const hex = document.createElement('span');
      hex.className = 'palHex';
      cell.append(swatch, label, hex);
      colors.append(cell);
      swatch.onclick = () => {
        if (!palette()) return;
        pl.editing = ink;
        const input = $('palColorInput'),
          hostRect = host.getBoundingClientRect(),
          swatchRect = swatch.getBoundingClientRect();
        input.style.left = swatchRect.left - hostRect.left + 'px';
        input.style.top = swatchRect.top - hostRect.top + 'px';
        input.value = css565ToInput(palette().colors[ink]);
        input.click();
      };
      swatch.oncontextmenu = (e) => {
        e.preventDefault();
        const entry = palette();
        if (!entry) return;
        StudioShell.contextMenu(e.clientX, e.clientY, [
          {
            label: 'Copy color',
            hint: 'Mod+C',
            run: () => {
              StudioShell.clipboard.set('color', entry.colors[ink]);
              pl.render();
            },
          },
          {
            label: 'Paste color',
            hint: 'Mod+V',
            disabled: !StudioShell.clipboard.has('color'),
            run: () => {
              const color = StudioShell.clipboard.get('color');
              paletteEdit('Paste a color', () => (entry.colors[ink] = color));
              pl.render();
            },
          },
          '-',
          { label: 'Edit color…', run: () => swatch.click() },
        ]);
      };
    }
    const swatch = cell.querySelector('button');
    swatch.style.background = entry ? css565(entry.colors[ink]) : 'transparent';
    swatch.title =
      ink === 0
        ? 'Color 0 — drawn on background tiles, transparent for sprites and the overlay'
        : `Color ${ink}`;
    swatch.setAttribute('aria-label', (entry ? entry.name + ' ' : '') + swatch.title);
    swatch.disabled = !entry;
    cell.querySelector('.palHex').textContent = entry
      ? '0x' + entry.colors[ink].toString(16).toUpperCase().padStart(4, '0')
      : '';
  }
}

/** Applies the color input to the color being edited. */
export function colorInput() {
  $('palColorInput').onchange = () => {
    if (!palette()) return;
    paletteEdit(
      'Change a color',
      () => (palette().colors[pl.editing] = inputTo565($('palColorInput').value)),
    );
    pl.render();
  };
}
