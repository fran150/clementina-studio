// The shape editor's rails: the left one opens the shape and tile panels and
// holds the tools, clipboard and history; the right one opens the draw order
// panel and holds flip, order and remove.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { copySprites, flip, moveSelection, moveToEnd, pasteSprites } from './editing.js';
import { setMode, shape } from './model.js';

const host = $('spriteComposer');
const iconButton = (id, label, icon) => StudioShell.iconButton(id, label, icon);

/**
 * Builds the title, both rails and their panel toggles, and starts every
 * panel closed.
 */
export function shapeRails() {
  // Matches the tileset editor's #canvasAssetLabel: ink-colored and sized off
  // the page's own 13px base, rather than inheriting .scTop's smaller 11px.
  const groupTitle = document.createElement('strong');
  groupTitle.id = 'scGroupTitle';
  groupTitle.style.color = 'var(--ink)';
  groupTitle.style.fontSize = '13px';
  host.querySelector('.scTop .studioBarStart').append(groupTitle);
  const library = host.querySelector('.scLibrary'),
    tileLibrary = host.querySelector('.scTileLibrary'),
    inspector = host.querySelector('.scInspector');
  const panelToggle = (panel, id, label, icon, group, asset = false) => {
    const b = iconButton(id, label, icon);
    StudioShell.bindPanel({ panel, button: b, group, closeGroups: [group], asset });
    return b;
  };
  const tool = (id, label, icon, mode) => {
    const b = $(id) ?? iconButton(id, label, icon);
    StudioShell.setIcon(b, icon, label);
    if (mode) b.onclick = () => setMode(mode);
    return b;
  };
  const rail = StudioShell.toolRail('scRail', 'Shape tools');
  host.prepend(rail);
  StudioShell.railLayout(
    rail,
    [
      [
        panelToggle(library, 'scLibraryToggle', 'Shapes', 'shape', 'shapeLeft'),
        panelToggle(
          tileLibrary,
          'scTileLibraryToggle',
          'Tileset and tile picker',
          'tilePicker',
          'shapeLeft',
          true,
        ),
      ],
      [
        tool(
          'scMoveTool',
          'Select and move (V) — click a sprite, drag to move it, drag empty space to box-select',
          'move',
          'move',
        ),
        tool(
          'scBoxSelect',
          'Box select (S) — drag to select every sprite the box touches, even starting on one',
          'select',
        ),
        tool(
          'scPlace',
          'Place tiles — click the canvas to add the tiles selected in the tile picker',
          'place',
        ),
        tool('scOriginTool', 'Place origin — or drag its crosshair', 'origin'),
        tool(
          'scPanTool',
          'Pan (H) — drag to scroll; Space or the middle button pan with any other tool active',
          'pan',
          'pan',
        ),
      ],
    ],
    [
      Object.assign(iconButton('scCopy', 'Copy selected sprites (Ctrl/Cmd+C)', 'copy'), {
        onclick: copySprites,
      }),
      Object.assign(iconButton('scPaste', 'Paste sprites (Ctrl/Cmd+V)', 'paste'), {
        onclick: pasteSprites,
      }),
      $('scUndo'),
      $('scRedo'),
    ],
  );
  document.addEventListener('studioclipboard', () => {
    if (!host.hidden) $('scPaste').disabled = !shape() || !StudioShell.clipboard.has('sprites');
  });
  const orderRail = StudioShell.toolRail('scOrderRail', 'Flip and sprite order', 'right');
  host.append(orderRail);
  const action = (id, label, icon, fn) => {
    const b = iconButton(id, label, icon);
    b.onclick = fn;
    return b;
  };
  {
    const old = $('scRemove');
    old.replaceWith(action('scRemove', 'Remove selected sprites (Delete)', 'delete', old.onclick));
  }
  StudioShell.railLayout(orderRail, [
    [panelToggle(inspector, 'scInspectorToggle', 'Draw order', 'drawOrder', 'shapeRight', true)],
    [
      action('scFlipX', 'Flip horizontally (Shift+H)', 'flipH', () => flip('x')),
      action('scFlipY', 'Flip vertically (Shift+V)', 'flipV', () => flip('y')),
    ],
    [
      action('scFront', 'Bring to front — draws last, in front of everything', 'front', () =>
        moveToEnd(true),
      ),
      action('scMoveUp', 'Move up — draws later, in front of the next sprite', 'forward', () =>
        moveSelection(1),
      ),
      action('scMoveDown', 'Move down — draws earlier, behind the next sprite', 'backward', () =>
        moveSelection(-1),
      ),
      action('scBack', 'Move to bottom — draws first, behind everything', 'back', () =>
        moveToEnd(false),
      ),
    ],
    [$('scRemove')],
  ]);
  inspector.hidden = true;
  library.hidden = true;
  tileLibrary.hidden = true;
  for (const id of ['scLibraryToggle', 'scTileLibraryToggle', 'scInspectorToggle'])
    $(id).setAttribute('aria-expanded', 'false');
}
