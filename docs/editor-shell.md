# Shared editor shell

Every editor workspace — palettes, tilesets, overlays, backgrounds, shapes,
animations, sounds and music — shares presentation primitives from `apps/desktop/studio-shell.js`
and `studio-shell.css`. These files load before editor scripts. Editor content,
model mutation, undo and canvas geometry stay in each editor.

- **Layout.** A workspace is a `.studioEditor` grid of five columns: left rail,
  left dock, main area (`.studioMain`), right dock, right rail. Docks are
  `.studioDock` plus `.studioDockLeft` or `.studioDockRight`; a hidden dock is no
  grid item, so its column collapses and the main area takes the room back. Docks
  sit beside the canvas, never over it. The left dock holds what the user picks
  from — asset libraries, tile pickers; the right dock holds the current
  selection's properties — a shape's draw order, a background's camera. The
  palette workspace alone opens two left docks side by side.
- `StudioShell.selectView(view)` updates the shared chrome and accessible current
  navigation item. The existing `showView` calls it before editor rendering.
- `icons` is the one set of glyphs: each concept has one icon, and each icon means
  one thing everywhere — an asset type looks the same on its library button in
  every editor. `iconButton(id, label, icon, options)` creates a labelled button
  and `setIcon` decorates an existing control without replacing its click
  handler; `icon` is a name from `icons`, or raw markup for the project file
  icons. Glyphs are trusted application SVG, never imported asset content.
- `toolRail(id, label, side)` creates a rail, left by default. `railLayout(rail,
  groups, actions)` fills it the same way everywhere: groups separated by a
  rule — panel toggles, then tools — and edit actions (copy, paste, undo, redo)
  pinned to the bottom. A right rail holds the selection's panel toggle and its
  transforms: flips, rotation, priority, arrangement, delete.
- `bindPanel({panel, button, closeId, closeClass, group, closeGroups, asset})` binds a
  dock and its trigger. It sets `aria-controls` and `aria-expanded`, adds a close
  button, and supports Escape inside the panel with focus returning to the trigger.
  `closeGroups` explicitly names groups to close on opening, keeping every trigger
  synchronized: each editor's left docks are mutually exclusive, and a right dock
  is independent of them. The palette library and bank configs are independent.
  `asset: true` marks a dock that shows a part of the open asset — its tile
  map, the tiles it draws from, its properties — rather than the list of
  assets. `emptyEditor(host, empty)`, called from each editor's render, hides
  those docks and disables their buttons while nothing is open, keeping
  whether each was open for when something is.
- Project-action icon styling, tooltips, navigation/header sizing, and global status
  presentation belong to the shell. Status messages are announced politely.
- `renderList(container, items, {selected, choose, rename, render, content, maxLength})`
  is the selectable, optionally renameable list every asset library uses: palettes,
  bank configs, tilesets, tileset objects, backgrounds, overlays, overlay
  placeholders, animations and shapes. It reuses row elements in place rather than
  recreating them, so a render triggered mid-double-click does not swap the node out
  from under the pointer — recreating rows resets the browser's dblclick count and
  was the root cause of an earlier bug. `content(row, item)` overrides the default
  `row.textContent = item.name` for rows that carry more than a name, such as a
  palette's color chips. `startRename(container, i, name, rename, render, maxLength)`
  is `renderList`'s own rename path, exposed separately for the one case that starts
  a rename programmatically right after creating an item (the tileset editor's
  Object list). Both call `render()` unconditionally once a rename commits, is
  cancelled, or is rejected by `rename` — that call is what clears the input back to
  text; skipping it is what leaves a rename stuck as a textbox.

- `canvasZoom({view, ids, min, max, get, set, fit, wheel, pan, busy})` is every
  zoomable canvas's navigation: the Fit, 100%, −, level, + cluster (existing
  elements named by `ids` are reused, missing ones created), the wheel, and the
  View menu's zoom commands for `view`. The plain wheel pans — natively for a
  scroll container, through `pan(dx, dy)` for a canvas with its own camera —
  and a pinch or Ctrl/Cmd+wheel steps the shared zoom ladder around the
  pointer. `set(zoom, clientX, clientY)` must keep that point in place;
  `zoomScrolled` does that for a scroll container and `fitZoom` picks the
  fitting step. The cluster goes in the middle of the top bar, between a
  `.studioBarStart` and a `.studioBarEnd`. `canvasCommand(view, command)` is
  how `runCommand` in `editor.html` reaches the current canvas.

- `clipboard` is the app's one clipboard: `set(kind, data)`, `get(kind)` and
  `has(kind)`, copying by value. It holds one kind of thing at a time —
  `pixels`, `cells`, `sprites`, `frames`, `palette`, `color`, `soundFrames` or
  `notes` — so a paste only
  lands where that kind fits, and fires `studioclipboard` on `document` so
  Paste buttons can follow it.
- `bankDock(container, pick)` and `syncBankDock(container, {color,
  transparentZero, chosen, used, title, disabled})` build and refresh the
  palette dock: one row per bank with its eight colors, a ring on the bank in
  use (`.chosenBank`), a dot on banks the asset uses (`.usedBank`).
  `hoverBankDock(container, {bank, ink} | null)` outlines, dashed, the bank
  (`.hoverBank`) and color (`.hoverColor`) of the pixel under the pointer; the
  background and overlay editors call it as the pointer moves over the canvas.
  The tileset editor builds its own rows, to pick single colors, with the same
  markup and classes.
- `cell-grid.js` is the Select tool for grids of background and overlay cells:
  `CellGrid.cellSelection({grid, edit, render})` handles the drag, move,
  nudge, copy, cut, paste, delete, select-all and flip, and `key(event)` maps
  the keyboard to them, so both editors behave identically. `cellAt(point)`
  is the cell drawn at a point, a block being moved or pasted included.

- `history.js` is the project's one undo history. An editor calls
  `ProjectHistory.checkpoint(parts, label)` before an edit — `parts` naming what
  the edit touches: `palettes` (the library, bank configs and active config),
  `tilesets`, `shapes`, `animations`, `backgrounds`, `overlays`, `instruments`,
  `sounds`, `songs` — and its Undo and
  Redo buttons call `ProjectHistory.undo` and `redo`. A step restores those
  parts, fires `studiohistory` on `document` for editors to clamp indices and
  drop transient state, and redraws everything. Ctrl/Cmd+Z and Edit ▸ Undo are
  handled once, here and in `runCommand`. The Undo and Redo buttons and Edit ▸
  Undo and Redo name the step they would take ("Undo Paint"); the page sends
  the menu labels to the main process, which rebuilds the menu, and sends
  plain, enabled ones while a text field has focus, whose own undo they run.
- `editActions(view, {copy, cut, paste})` registers the commands a view's
  clipboard keys run, so Edit ▸ Cut, Copy and Paste clicked in the menu do the
  same outside a text field.

- `viewStatus(view, element)` hands an editor's status line to the one status
  bar, shown while that view is current.
- `renderList` also takes `duplicate(item, i)` and `remove(item, i)`: with
  `rename`, they make the row's right-click menu, and `remove` also answers
  Delete on a focused row.
- `contextMenu(x, y, items)` is every right-click menu: items are
  `{label, hint, run, disabled}` and `'-'` separates groups. A hint is written
  `Mod+C`, shown as ⌘C on a Mac and Ctrl+C elsewhere. Canvases open it with
  a non-painting tool; a painting tool's right button erases instead.
- `showShortcuts()` opens the keyboard shortcut sheet — everywhere, then the
  current view's — and `helpButton()` makes the **?** button each editor's top
  bar ends with.
- The bank config every editor previews with is one global choice: the
  `#configPicker` beside the editor tabs. Editors do not carry their own.
- `.studioEmpty` with `.studioEmptyActions` is the empty state every editor
  shows when it has nothing to edit: what is missing, and the button that
  makes it. It fills the main area, centered, and the editor's top bar and
  stage hide while it shows.
- `.studioEditor > .studioMain` is a column filling its grid cell in every
  editor: top bar, stage, palette dock.
- `.studioStage` is the field every canvas sits on — the same dark dot grid
  as the empty state — and `.studioArt` gives the art on it a hairline edge
  and a drop shadow. A canvas that draws its own camera (Shapes) clears
  around the art so the stage shows through.
- `.canvasPreview` is the Preview panel: the art at a small size at the
  stage's top-right, toggled by a Preview button (the `miniature` icon) in the
  top bar. Tilesets and Shapes both have it, shown by default.

- `audio-shared.js` is what the Sounds and Music editors share on top of the
  shell, as `StudioAudio`: `play(stream)`, `stop()` and `position()` play a
  stream from the MIA engine (`window.MiaAudio`, the compiled
  `packages/assets/audio.ts`, loaded by `editor.html` as a module) through a
  24 kHz `AudioContext`, a chunk at a time; `envelopeRows`, `syncEnvelope`,
  `bindEnvelope` and `drawEnvelope` are the envelope fields and the curve the
  engine draws; `bindRange` makes one slider drag one undo step; and
  `voiceColors` is the color each of MIA's four voices draws in. Its
  `.audioField`, `.audioDock`, `.audioTransport` and `.audioStage` classes
  are the docks' rows, the transport under a canvas and a canvas that fills
  its stage. See [audio.md](audio.md).

Future scene editors should compose these primitives and own their
canvas/timeline/inspector content. Keep selection and panel visibility out of portable
asset files. A shared shell does not require identical editor-specific layouts.

Run `npm test` and `npm run test:ui` (every Electron suite), or one suite
such as `npm run test:desktop:conventions`.
When launched from a host that sets `ELECTRON_RUN_AS_NODE`, unset that variable for
Electron tests. Development Electron security notices may be suppressed for the
smoke runner using `ELECTRON_DISABLE_SECURITY_WARNINGS=1`; this does not change app
security settings. The shell suite checks navigation, drawer state, keyboard/focus
behavior and project data preservation in the real renderer.
