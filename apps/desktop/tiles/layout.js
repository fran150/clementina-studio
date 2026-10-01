// The tile editor's layout, built around the page's markup: the rails and
// their tools, the libraries as docks, the top bar with its view settings
// and fill options, the canvas stage with the Preview, and the palette dock.
// Each step runs where tileset-editor.js calls it, in the order the editor was
// always built.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { icon, paths } from './icons.js';
import { backgroundRow, scroll, tl } from './model.js';
import { clearSelection, copySelection, startPaste, transformSelection } from './pixels.js';
import { drawMiniature } from './view.js';

const host = $('tilesetEditor');
const palettePanel = host.querySelector('.inlinePalettes');
const canvasPanel = host.querySelector('.bankCanvases');
// Built by one step and extended by later ones.
let rail, libraryToggle, mapToggle, top, properties, stage, miniButton, options;

/** Moves the palettes and the preview background above the canvases. */
export function placePanels() {
  canvasPanel.before(palettePanel);
  canvasPanel.before(backgroundRow);
}
/** Builds the left rail, the docks, the top bar, the stage and the palette dock. */
export function buildLayout() {
  rail = StudioShell.toolRail('drawingTools', 'Drawing tools');
  const banks = host.querySelector('.bankLibrary'),
    objects = host.querySelector('.objectLibrary'),
    mapPanel = $('bankMap').parentElement;
  const eraser = document.createElement('button');
  eraser.id = 'eraserTool';
  eraser.textContent = '▱ Eraser';
  eraser.onclick = () => {
    tl.tool = 'eraser';
    tl.render();
  };
  const picker = document.createElement('button');
  picker.id = 'pickerTool';
  picker.textContent = '⌖ Pick color';
  picker.onclick = () => {
    tl.tool = 'picker';
    tl.render();
  };
  // A sticky toggle layered over the tool system, not a tool of its own — it
  // works no matter which drawing tool was active before, the same way
  // Space-drag and middle-drag already do.
  const panButton = document.createElement('button');
  panButton.id = 'panTool';
  panButton.onclick = () => {
    tl.panToolActive = !tl.panToolActive;
    tl.render();
  };
  $('pencilTool').textContent = '✎ Pencil';
  $('fillTool').textContent = '▨ Fill';
  rail.append(
    $('pencilTool'),
    eraser,
    $('fillTool'),
    picker,
    panButton,
    $('bankUndo'),
    $('bankRedo'),
  );
  // The tileset library and the tile map dock beside the canvas like every
  // other editor's panels. The map is how a tileset's tiles are chosen for
  // drawing, so it starts open.
  objects.prepend(mapPanel);
  mapPanel.querySelector('h2').textContent = 'Tile map';
  for (const panel of [banks, objects]) panel.classList.add('studioDock', 'studioDockLeft');
  banks.hidden = true;
  objects.hidden = false;
  const panelToggle = (panel, id, label, icon, asset = false) => {
    const b = StudioShell.iconButton(id, label, icon);
    StudioShell.bindPanel({
      panel,
      button: b,
      group: 'tilesLeft',
      closeGroups: ['tilesLeft'],
      asset,
    });
    return b;
  };
  libraryToggle = panelToggle(banks, 'bankLibraryToggle', 'Tilesets', 'tileset');
  mapToggle = panelToggle(objects, 'bankMapToggle', 'Tile map and objects', 'tilePicker', true);
  // Objects' New and Delete join the icon toolbar every library has.
  const objectActions = document.createElement('div');
  objectActions.className = 'assetToolbar';
  StudioShell.setIcon($('saveComposition'), 'newItem', 'New object from the selected tiles');
  StudioShell.setIcon($('deleteComposition'), 'delete', 'Delete object');
  const objectButtons = $('saveComposition').parentElement;
  objectActions.append($('saveComposition'), $('deleteComposition'));
  objectButtons.remove();
  $('compositionList').before(objectActions);
  const center = document.createElement('div');
  center.id = 'drawingCenter';
  top = document.createElement('div');
  top.id = 'canvasTop';
  top.innerHTML =
    '<div class="studioBarStart"><strong id="canvasAssetLabel"></strong><span id="canvasSize"></span></div>';
  top.append($('zoomOut'), $('zoomLabel'), $('zoomIn'), $('cellGrid').parentElement);
  properties = document.createElement('details');
  properties.innerHTML = '<summary>Display settings</summary>';
  const zeroRow = document.createElement('label');
  zeroRow.id = 'zeroModeRow';
  const zeroSelect = document.createElement('select');
  zeroSelect.id = 'zeroMode';
  zeroSelect.setAttribute('aria-label', 'How color 0 is shown');
  zeroSelect.append(
    new Option('Transparent', 'transparent'),
    new Option('Background color', 'background'),
  );
  zeroSelect.onchange = () => {
    tl.zeroAsColor = zeroSelect.value === 'background';
    tl.render();
  };
  zeroRow.append(zeroSelect);
  properties.append(
    $('bankFileMode').parentElement,
    $('bankFilePlaneLabel'),
    zeroRow,
    backgroundRow,
  );
  top.append(properties);
  stage = document.createElement('div');
  stage.id = 'canvasStage';
  stage.className = 'studioStage';
  stage.append(scroll);
  const dock = document.createElement('section');
  dock.id = 'paletteDock';
  dock.append(palettePanel);
  const hint = host.querySelector('.selectionWork p');
  if (hint) hint.remove();
  center.append(top, $('emptyBank'), stage, dock);
  host.replaceChildren(rail, banks, objects, center);
  host.classList.add('studioEditor');
  center.classList.add('studioMain');
  $('emptyBank').classList.add('studioEmpty');
  $('bankSelection').classList.add('studioArt');
  $('emptyBank').innerHTML =
    '<p>No tilesets yet. A tileset is one CHR bank of 256 tiles.</p><div class="studioEmptyActions"><button id="emptyNew">New tileset</button><button id="emptyImport">Import tileset…</button></div>';
  $('emptyNew').onclick = () => $('addBankFile').click();
  $('emptyImport').onclick = () => $('importBankFile').click();
}
/** Gives the tools their icons and adds the line, rectangle and ellipse tools. */
export function addShapeTools() {
  for (const [id, name, label] of [
    ['pencilTool', 'pencil', 'Pencil (B)'],
    ['eraserTool', 'eraser', 'Eraser (E)'],
    ['fillTool', 'fill', 'Fill (G)'],
    ['pickerTool', 'picker', 'Pick color (I)'],
    [
      'panTool',
      'pan',
      'Pan (H) — drag to scroll; Space or the middle button pan with any other tool active',
    ],
    ['bankUndo', 'undo', 'Undo (Ctrl/Cmd+Z)'],
    ['bankRedo', 'redo', 'Redo (Ctrl/Cmd+Shift+Z)'],
  ])
    icon($(id), name, label);
  for (const [kind, label] of [
    ['line', 'Line (L)'],
    ['rectangle', 'Rectangle (R) — Shift draws a square'],
    ['ellipse', 'Ellipse (O) — Shift draws a circle'],
  ]) {
    const button = document.createElement('button');
    button.id = kind + 'Tool';
    icon(button, kind, label);
    button.onclick = () => {
      tl.shapeStart = null;
      tl.tool = kind;
      tl.render();
    };
    rail.insertBefore(button, $('bankUndo'));
  }
}
/** Adds the Preview panel and its toggle. */
export function buildMiniature() {
  miniButton = document.createElement('button');
  miniButton.id = 'miniatureToggle';
  miniButton.setAttribute('aria-expanded', 'true');
  miniButton.classList.add('on');
  icon(miniButton, 'miniature', 'Preview');
  top.insertBefore(miniButton, properties);
  const mini = document.createElement('aside');
  mini.id = 'miniaturePanel';
  mini.className = 'canvasPreview';
  mini.innerHTML =
    '<strong>Preview</strong><canvas id="miniatureCanvas"></canvas><span id="miniatureSize"></span>';
  stage.append(mini);
  miniButton.onclick = () => {
    tl.miniVisible = !tl.miniVisible;
    mini.hidden = !tl.miniVisible;
    miniButton.classList.toggle('on', tl.miniVisible);
    miniButton.setAttribute('aria-expanded', String(tl.miniVisible));
    drawMiniature();
  };
}
/** Adds the Select tool and the canvas's Copy and Paste. */
export function addSelectionTools() {
  for (const [id, name, label, fn] of /** @type {[string, string, string, () => void][]} */ ([
    [
      'selectionTool',
      'select',
      'Select (S)',
      () => {
        tl.tool = 'select';
        tl.pasteAnchor = null;
        tl.render();
      },
    ],
    ['copyPixels', 'copy', 'Copy selection (Ctrl/Cmd+C)', copySelection],
    ['pastePixels', 'paste', 'Paste (Ctrl/Cmd+V; with Shift, the source palettes too)', startPaste],
  ])) {
    const button = document.createElement('button');
    button.id = id;
    icon(button, name, label);
    button.onclick = fn;
    rail.insertBefore(button, $('bankUndo'));
  }
}
/** Adds the drawing options (filled shapes, transforms, paste options) and the status line. */
export function buildOptions() {
  options = document.createElement('div');
  options.id = 'drawingOptions';
  options.innerHTML =
    '<label><input id="filledShapes" type="checkbox">Filled shapes</label><button id="flipHorizontal" title="Flip selection horizontally">Flip ↔</button><button id="flipVertical" title="Flip selection vertically">Flip ↕</button><button id="rotateSelection" title="Rotate selection clockwise 90 degrees">Rotate 90°</button><details><summary>Paste options</summary><label><input id="pasteOpaque" type="checkbox">Opaque (include zero pixels)</label><label><input id="pasteSource" type="checkbox">Use source palettes (Ctrl/Cmd+Shift+V)</label><p>Missing source palettes are copied into unused slots. Each touched tile uses the first pasted pixel’s palette, affecting the whole tile. The preview shows this before placement.</p></details>';
  top.after(options);
  for (const [id, kind] of [
    ['flipHorizontal', 'horizontal'],
    ['flipVertical', 'vertical'],
    ['rotateSelection', 'rotate'],
  ])
    $(id).onclick = () => transformSelection(kind);
  $('pasteOpaque').onchange = $('pasteSource').onchange = tl.render;
  const status = document.createElement('div');
  status.id = 'drawingStatus';
  StudioShell.viewStatus('tiles', status);
}
/** Finishes the layout: the right rail, view tools, fill options, rail order and labels. */
export function finishLayout() {
  const helpButton = StudioShell.helpButton();

  const transforms = StudioShell.toolRail('transformTools', 'Selection transforms', 'right');
  for (const [id, name, label] of [
    ['flipHorizontal', 'flipH', 'Flip the selection horizontally (Shift+H)'],
    ['flipVertical', 'flipV', 'Flip the selection vertically (Shift+V)'],
    ['rotateSelection', 'rotate', 'Rotate selection clockwise 90°'],
  ]) {
    icon($(id), name, label);
    transforms.append($(id));
  }
  host.append(transforms);
  const viewTools = document.createElement('div');
  viewTools.id = 'viewTools';
  viewTools.className = 'studioBarEnd';
  const gridLabel = $('cellGrid').parentElement;
  gridLabel.hidden = true;
  const gridButton = document.createElement('button');
  gridButton.id = 'tileGridToggle';
  icon(gridButton, 'grid', 'Toggle tile grid');
  gridButton.setAttribute('aria-pressed', String($('cellGrid').checked));
  gridButton.onclick = () => {
    $('cellGrid').checked = !$('cellGrid').checked;
    gridButton.setAttribute('aria-pressed', String($('cellGrid').checked));
    gridButton.classList.toggle('on', $('cellGrid').checked);
    tl.render();
  };
  gridButton.classList.toggle('on', $('cellGrid').checked);
  const pasteOptions = options.querySelector('details');
  pasteOptions.id = 'pasteOptions';
  properties.id = 'displaySettings';
  for (const [details, name, label] of /** @type {[HTMLDetailsElement, string, string][]} */ ([
    [pasteOptions, 'paste', 'Paste options'],
    [properties, 'settings', 'Display settings'],
  ])) {
    const summary = details.querySelector('summary');
    icon(summary, name, label);
    const pop = document.createElement('div');
    pop.className = 'viewPopover';
    while (summary.nextSibling) pop.append(summary.nextSibling);
    details.append(pop);
    details.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(details.open));
      if (details.open)
        for (const other of [pasteOptions, properties]) if (other !== details) other.open = false;
    });
  }
  viewTools.append(pasteOptions, properties, gridButton, miniButton, helpButton);
  top.append(viewTools);

  // Fill controls: the filled toggle and patterns, enabled per tool (see render).
  const filledLabel = $('filledShapes').parentElement;
  filledLabel.hidden = true;
  paths.filled = '<rect x="4" y="4" width="18" height="18" fill="currentColor"/>';
  paths.checker =
    '<rect x="4" y="4" width="18" height="18"/><path d="M4 4h6v6H4zM16 4h6v6h-6zM10 10h6v6h-6zM4 16h6v6H4zM16 16h6v6h-6z" fill="currentColor" stroke="none"/>';
  paths.stripes =
    '<rect x="4" y="4" width="18" height="18"/><path d="M4 7h18M4 13h18M4 19h18" stroke-width="3"/>';
  paths.fillToggle =
    '<rect x="3" y="3" width="20" height="20"/><path d="M5 5h16v16z" fill="currentColor" stroke="none"/>';
  const fillToggle = document.createElement('button');
  fillToggle.id = 'filledShapeToggle';
  icon(fillToggle, 'fillToggle', 'Toggle filled rectangles and ellipses');
  fillToggle.onclick = () => {
    $('filledShapes').checked = !$('filledShapes').checked;
    tl.render();
  };
  const patternButtons = [
    ['solid', 'Solid fill'],
    ['checker', 'Checkerboard fill'],
    ['stripes', 'Horizontal stripe fill'],
  ].map(([name, label]) => {
    const button = document.createElement('button');
    button.id = 'fillPattern_' + name;
    icon(button, name === 'solid' ? 'filled' : name, label);
    button.onclick = () => {
      tl.fillPattern = name;
      tl.render();
    };
    return button;
  });
  options.hidden = true;
  // Rails in the order every editor uses: panels, then tools, then edit
  // actions pinned to the bottom; on the right, the selection's transforms
  // and the fill tools' options.
  StudioShell.railLayout(
    rail,
    [
      [libraryToggle, mapToggle],
      [
        $('selectionTool'),
        $('pencilTool'),
        $('eraserTool'),
        $('fillTool'),
        $('lineTool'),
        $('rectangleTool'),
        $('ellipseTool'),
        $('pickerTool'),
        $('panTool'),
      ],
    ],
    [$('copyPixels'), $('pastePixels'), $('bankUndo'), $('bankRedo')],
  );
  StudioShell.railLayout(transforms, [
    [$('flipHorizontal'), $('flipVertical'), $('rotateSelection')],
    [
      Object.assign(
        StudioShell.iconButton('clearPixels', 'Clear the selection (Delete)', 'delete'),
        {
          onclick: clearSelection,
        },
      ),
    ],
  ]);
  // The fill tools' options are a context bar, shown in the top bar only
  // while a tool that uses them is active, as Photoshop and Aseprite do.
  const toolOptions = document.createElement('div');
  toolOptions.id = 'toolOptions';
  toolOptions.setAttribute('aria-label', 'Fill options');
  toolOptions.append(fillToggle, ...patternButtons, filledLabel);
  top.querySelector('.studioBarStart').append(toolOptions);
  paths.pasteSettings =
    StudioShell.icons.paste +
    '<circle cx="19" cy="18" r="6" fill="var(--panel)"/><path d="M19 10v3M19 23v3M11 18h3M24 18h2M13 12l2 2M23 12l-2 2M13 24l2-2M23 24l-2-2"/><circle cx="19" cy="18" r="2"/>';
  icon(pasteOptions.querySelector('summary'), 'pasteSettings', 'Paste options');
  pasteOptions.querySelector('.viewPopover p')?.remove();
  for (const id of ['pasteOpaque', 'pasteSource']) {
    const input = $(id),
      label = input.parentElement;
    const text = document.createElement('span');
    text.textContent =
      id === 'pasteOpaque' ? 'Opaque (include zero pixels)' : 'Use source palettes';
    label.replaceChildren(input, text);
    if (id === 'pasteSource') label.title = 'Paste source palettes: Ctrl/Cmd+Shift+V';
  }
  backgroundRow.querySelector('span')?.remove();
  const bgLabel = $('previewBackground').parentElement;
  for (const n of [...bgLabel.childNodes])
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) n.textContent = 'Background';
  const captions = {
    bankFileMode: 'Color mode',
    bankFilePlane: 'Plane',
    zeroMode: 'Color 0',
    previewBackground: 'Background',
  };
  for (const [id, text] of Object.entries(captions)) {
    const input = $(id),
      label = input.parentElement;
    const caption = document.createElement('span');
    caption.textContent = text;
    label.replaceChildren(caption, input);
  }
}
