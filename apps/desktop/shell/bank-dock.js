// The palette dock the background, overlay and shape editors show — and,
// with its own color-level picking, the tileset editor: one row per palette
// bank, its label and eight colors, in a .bankSwatches grid. These editors
// pick a whole bank, so a click anywhere on a row picks it. A cyan ring
// (.chosenBank) marks the bank painting or the selection uses; a dot
// (.usedBank) the banks the asset on screen already uses; dashed outlines
// the bank (.hoverBank) and color (.hoverColor) of the pixel under the pointer.
export const TRANSPARENT_ZERO =
  'linear-gradient(135deg,white 43%,#e32636 44%,#e32636 56%,white 57%)';
/** Builds the sixteen bank rows in `container` once; clicking a row calls pick(bank). */
export function bankDock(container, pick) {
  if (container.children.length === 16) return;
  container.classList.add('bankSwatches');
  container.replaceChildren(
    ...Array.from({ length: 16 }, (_, bank) => {
      const row = document.createElement('div');
      row.className = 'paletteGroup';
      row.dataset.palette = String(bank);
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      const label = document.createElement('span');
      label.textContent = String(bank).padStart(2, '0');
      row.append(label);
      for (let ink = 0; ink < 8; ink++) {
        const swatch = document.createElement('i');
        swatch.dataset.palette = String(bank);
        swatch.dataset.ink = String(ink);
        row.append(swatch);
      }
      const choose = () => {
        if (!row.classList.contains('disabled')) pick(bank);
      };
      row.onclick = choose;
      row.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      };
      return row;
    }),
  );
}
// color(bank, ink) → CSS color; transparentZero draws color 0 as the
// transparent swatch, for layers where it shows what is behind.
export function syncBankDock(
  container,
  { color, transparentZero = false, chosen = null, used = null, title, disabled = false },
) {
  container.querySelectorAll('.paletteGroup').forEach((row) => {
    const bank = Number(row.dataset.palette);
    row.querySelectorAll('[data-ink]').forEach((swatch, ink) => {
      swatch.style.background = ink === 0 && transparentZero ? TRANSPARENT_ZERO : color(bank, ink);
    });
    row.classList.toggle('chosenBank', bank === chosen);
    row.classList.toggle('usedBank', !!used?.has(bank));
    row.classList.toggle('disabled', disabled);
    row.setAttribute('aria-disabled', String(disabled));
    row.title = title(bank);
    row.setAttribute('aria-label', row.title);
  });
}
// Outlines the bank and color of the pixel under the pointer — {bank, ink},
// or null once the pointer leaves the canvas. Cheap enough for pointermove.
export function hoverBankDock(container, hover) {
  container.querySelectorAll('.paletteGroup').forEach((row) => {
    const on = Number(row.dataset.palette) === hover?.bank;
    row.classList.toggle('hoverBank', on);
    row
      .querySelectorAll('[data-ink]')
      .forEach((swatch, ink) => swatch.classList.toggle('hoverColor', on && ink === hover.ink));
  });
}
