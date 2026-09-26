# Clementina Studio

Development tools for creating Clementina games and programs.

## Scope

- Desktop editors for tilesets, palettes, shapes, animations, maps, music, and
  sound effects.
- Shared asset converters and command-line build tools.
- BASIC tokenizer and generated runtime asset loaders.
- A future VS Code extension for Clementina BASIC.

Game assembly remains in its own repository and uses ca65/ld65, matching
Clementina ROM's toolchain. Studio is a TypeScript workspace with an Electron
desktop application.

## The model

Studio uses the hardware's own vocabulary: a *palette* is eight colors, a
*palette bank* is one of the sixteen entries of palette RAM, a *bank config*
names the palette in each of those sixteen, and a *tileset* is one CHR bank's
worth of graphics. **[docs/model.md](docs/model.md) is the reference** — what
each word means, which hardware constraint it reflects, and what a project
stores versus what reaches a file. Read it before changing the project format
or any editor.

The short version: a tile carries no color. CHR memory holds bit planes of
color indices, and the palette is chosen where a tile is *placed* — in a
background cell's attribute byte or an OAM entry. So tiles and sprites record
palette bank *numbers*, and loading a different config recolors everything
drawn against them.

## Normal workflow

Define palettes and the bank configs that place them in palette RAM, draw
tilesets, build shapes from their tiles, sequence shapes into animations, paint
backgrounds, design the overlay, then make sound effects and compose music —
the order of the editor tabs. The active
config is a preview choice, switched from the one Config picker beside the tabs;
it does not change what a project stores.

A later build step will lay out Clementina's memory, choose files and emit a
loader. It is deliberately last, so that it handles maps, scenes and music too
rather than being rewritten for each. **There is no export path today**, and
the half-finished one was removed rather than carried.

PRG files use Clementina's CPU-memory load format. Assets destined for MIA
memory use the existing runtime loading formats; do not assume that a PRG
header can describe MIA destinations. Raw binary files can be runtime assets.

## Layout

- `apps/desktop`: the asset studio. `editor.html` is the shell — model, state,
  helpers and view switching. `studio-shell.js` / `studio-shell.css` supply shared
  navigation, project buttons, tool rails, drawers, tooltips and status styling. Each other editor is a
  self-attaching script: `bank-editor.js` (tilesets), `overlay-editor.js`
  (the fixed HUD/text layer, loaded before `background-editor.js` since the
  latter reads its assets for a preview toggle), `background-editor.js`
  (backgrounds), `palette-library.js` (palettes and bank configs),
  `sprite-composer.js` (shapes), `animation-editor.js` (animations),
  `image-import-ui.js` (artwork import), `sound-editor.js` (sounds) and
  `music-editor.js` (songs and instruments), which share `audio-shared.js`.
  They load after the shell and wrap its `showView`/`redrawAll`, so the shell
  boots them via `bootStudio()`.
- `packages/assets`: the project format, its validators, and the attribute
  encoders. `audio.ts` is the audio model, the MIA audio engine and the song
  compiler; it has no runtime imports, so `editor.html` loads its compiled
  module into the page as `window.MiaAudio`.
- `tests/firmware`: the harness that runs clementina-mia's `audio.c` on the
  desktop to check Studio's engine against it (`npm run test:firmware`).
- `apps/vscode`, `packages/basic`, `packages/cli`, `examples`: planned.

## Companion repositories

Paths below are relative to this checkout in the development directory layout:

- `../../assembler/clementina-rom`: kernel, BASIC, and runtime file-format
  documentation. `docs/basic-video.md` and `docs/memory-map.md` are where the
  register and attribute layouts come from.
- `../../pico/clementina-mia`: authoritative hardware definitions and
  graphics/audio memory layouts.
- `../../go/clementina-6502`: emulator and CPU-visible behavior verification.
- `../../go/clementina-video-client`: the renderer. `internal/render/renderer.go`
  is the authority on compositing order and priority.

Verify generated BASIC files against the actual ROM tokenizer and SAVE/LOAD
behavior.

## Project files

Projects are `.cstudio` JSON, `format: "clementina-studio"`, `version: 2`.
They hold the palette library, the bank configs and which is active, the
tilesets, the shapes, the animations that sequence them, the backgrounds and
overlays, and the instruments, sounds and songs. Version 1 files are rejected:
they stored palettes per bank and eight fixed CHR banks, a model with no
equivalent here, and Studio is unreleased. The `.mtb` importer that read the
pre-Studio flat format is gone with them.

Raw `.CHR`, `.BIN` and `.PRG` tile data still imports, into a new tileset.

## Editors

**Palettes.** The library on the left, the eight colors of the selected
palette in the middle, the bank configs on the right. A config shows all
sixteen banks with a palette picker each; two banks may hold the same palette.
Deleting a palette that configs use asks which palette those banks should hold
instead, or offers to empty them.

**Tilesets.** A 16×16 tile map, a zoomable pixel canvas over the selected
rectangle, and palette RAM as the active config arranges it. Painting records
the selected color's bank number on the tile. A tileset is 1bpp or 3bpp; at
1bpp it is three independent 256-tile pages and the plane selector picks which
is on screen, with the color picker limited to indices 0 and 1. A Pan tool
(also Space-drag or the middle button, with any other tool active) scrolls
the zoomed pixel canvas instead of drawing.

**Overlays.** The fixed 40×25 hardware text/HUD layer — no `BGMODE`, no
scroll, its own `OVLBANK`/`OVLALT` primary and alternate tileset pair. Same
cell shape, tile picker, Objects list, paint and Select tools as backgrounds. A **placeholder** is a named
rectangular region, nothing more; whatever is painted inside it is the
overlay's real initial content, not a mockup — a future build step generates
a primitive per placeholder that overwrites its tile IDs at runtime. Where
either assigned tileset is 1bpp, a plane selector picks which of its three
pages the picker and canvas render from — preview state, never exported.

**Backgrounds.** A free-sized, pannable and zoomable canvas of cells, drawing
from a primary and an alternate tileset — a cell's `CHR_ALT` bit picks which
one it reads. Painting stamps a tile, a palette bank (defaulting to the tile's
authored bank, overridable), flip X/Y and priority into each cell. Two nested
rectangles preview the hardware: the outer one (white) is any of the six
`BGMODE` viewport sizes (what would be loaded into the active `BGSET`'s
tables), the inner one (yellow) is the fixed 320×200 physical screen
positioned by scroll within it (what is actually visible), wrapping at the
mode's edges. Each has its own draggable handle, colored to match its
rectangle. A togglable Status panel explains what the two colors mean and
reads out the register-level detail behind them: `BGMODE`, `BGSET`, the
loaded window's origin, `SCROLL_X`/`SCROLL_Y`, and which physical tables the
visible screen currently touches. A "toggle overlay" control composites a
chosen overlay asset over the inner rectangle, so a level and its HUD can be
checked together. Where either tileset is 1bpp, a plane selector picks which
page renders, same as the overlay editor. None of this is exported. Resizing
preserves existing cells anchored at the top-left.

**Shapes.** One arrangement of sprites, free-positioned around an origin,
drawing from one tileset — Clementina has a single sprite CHR bank, so
everything on screen at once comes from the same one. The tileset is locked
once a shape holds sprites. Each sprite carries a palette bank, defaulting to
the one its tile was drawn against and overridable per sprite. List order is
OAM order, so a later sprite draws on top, matching the renderer. Where the
tileset is 1bpp, a plane selector picks which page the tile picker shows.

**Animations.** A sequence of shapes with 60 Hz tick durations, an optional
per-frame offset, and a native 320×200 preview that scales to the workspace. An animation references its shapes rather
than copying them, so editing a shape updates every frame showing it. All of
an animation's shapes must draw from the same tileset. Sprite-versus-background
priority is not editable yet; it belongs to the future scene editor.

**Sounds.** A sound effect is one voice's registers, frame by frame at 60 Hz —
pitch, volume, pulse width, waveform and gate — under one envelope and pan:
what a game's driver writes to a voice it takes from the music for a moment.
Draw the frames on five lanes with the pencil and line, or start from a
generated blip, coin, jump, laser, explosion, hit or power-up.

**Music.** A song is MIA's four voices of notes on a piano roll, with a tempo,
a length and a loop, played by the chip's background sequencer at no cost to
the 6502. A voice plays one note at a time, and a voice without notes stays
free for sound effects. Notes play instruments — waveform, pulse width,
envelope and volume — and can slide legato from the note before. The Song
panel shows how many bytes of sequencer data each voice compiles to.

Both preview on a port of MIA's `audio.c` that plays sample for sample what
the firmware does. **[docs/audio.md](docs/audio.md)** is the reference: the
hardware, why sound effects and music are separate editors, what a song
compiles to, and three things found in the firmware and ROM along the way.

## Tests

`npm test` compiles the TypeScript and runs the model tests: the project
format, its validators, palette and config behavior, background and overlay
validation, the two attribute bit layouts, image import, and audio — the song
compiler's bytes and timing, sound-effect writes, generated sounds, and the
engine held to the output hashes MIA's firmware produced.

`npm run test:firmware` compiles clementina-mia's own `src/mia/audio/audio.c`
on the desktop (it needs a C compiler and the clementina-mia checkout beside
this one, or `MIA_DIR`), plays every audio test scenario on it and on Studio's
engine, and compares every sample. Rerun it when the firmware's audio changes.

`npm run test:desktop` drives the real renderer in Electron and covers the
model end to end — that a tile records a bank and recolors with the config,
that a 1bpp tileset's planes are independent, that configs can be created and
switched, that deleting a palette repoints the banks holding it, and that a
project round trips through save and restore.

## Not yet built

A scene editor, the build step, and the runtime
routine library. `docs/model.md` records what each will need and which
hardware constraints they have to respect — notably that a scene is where
co-residency and sprite-versus-background priority get decided, and where an
authored background's mapping onto physical hardware tables and runtime
streaming will eventually be handled.

Shared UI conventions and extension points: **[docs/editor-shell.md](docs/editor-shell.md)**.

### Canvas navigation and menus

The tileset, overlay, background and shape canvases navigate the same way.
The wheel or a two-finger swipe pans (Shift+wheel pans sideways); a pinch or
Ctrl/Cmd+wheel zooms around the pointer. Space-drag, the middle button and the
Pan tool (H) pan too. Zoom steps are whole numbers above 1× — 1, 2, 3, 4, 6, 8,
12, 16, 24, 32 — so every art pixel stays the same size on screen, and halve
below it (0.5×, 0.25×) for art bigger than the window; tilesets never go below
1×. Every canvas's top bar centers the same Fit, 100%, −, level, + cluster.
Every canvas opens fitted to the window and keeps its zoom when you come back
to it; a tileset refits when the area picked on its tile map changes size. The
animation preview, a player, keeps fitting its space — fractionally — until it
is zoomed by hand.

The File menu holds New (Ctrl/Cmd+N), Open (Ctrl/Cmd+O), Save (Ctrl/Cmd+S) and
Save As (Ctrl/Cmd+Shift+S); the View menu switches editors with Ctrl/Cmd+1–8, in
the tabs' order, as a browser switches tabs, and holds Zoom In (Ctrl/Cmd+=), Zoom
Out (Ctrl/Cmd+−), Zoom to Fit (Ctrl/Cmd+0) and Actual Size (Ctrl/Cmd+Alt+0). The menu
owns these shortcuts, so they work while a field has focus. There is no page
zoom or Reload: the first scaled the whole interface, the second dropped the
open project.

Painting tools share letters across editors: B pencil, E eraser, G fill, I pick,
H pan, R rectangle, S select; the tileset and sound editors add L line, the
tileset editor O ellipse, and the shape editor V select-and-move. In the sound
and music editors Space plays and stops when tapped, and pans while held. Shift+H and Shift+V flip the selection
horizontally and vertically wherever there is one to flip.

Right-click means one thing everywhere. With a painting tool it paints color 0
— it erases — the way Aseprite's right button paints the background color;
with any other tool it opens the edit menu: cut, copy, paste, delete, the
flips and arrangement that apply, select all. Right-click an animation frame
for the frame menu, and a color in the palette editor or the tileset editor's
palette dock to copy, paste or edit it.

Every editor is laid out the same way: a rail of panel toggles and tools on
the left, with copy, paste, undo and redo pinned to its bottom; panels to pick
from docked on the left (libraries, tile pickers); the selection's own panel
and transforms — flips, rotation, priority, arrangement, delete — on a right
rail, with its properties docked on the right: a shape's draw order, a
background's camera, the selected placeholder, the selected animation frame.
Docked panels sit beside the canvas and never cover it. Picking tiles
in a tile picker switches to the tool that places them (the pencil, or Place
tiles for shapes), as Tiled does.

The editor tabs end with the project's New, Open, Save and Save As; the window
title names the project's file and says when it has unsaved edits. One status
bar carries the app's messages, the current editor's status (sizes, counts,
what is under the pointer) and the unsaved-changes marker. Library rows rename
with F2 or a double-click, and offer Rename, Duplicate and Delete on a
right-click; Delete also deletes the focused row. Deleting anything that undo
can bring back asks no question — the status bar says how to undo it. An
editor with nothing to show says what is missing, with the button that makes
it. **?**, Ctrl/Cmd+/, Help ▸ Keyboard Shortcuts or any editor's **?** button
lists the keys that work everywhere and in the editor on screen.

### Selection and the clipboard

Selection works the same everywhere it applies. The Select tool (S) drags a
rectangle — of tileset pixels, or of background or overlay cells; in the shape
editor, sprites are clicked or boxed. Dragging inside a selection moves it,
arrows nudge it, Ctrl/Cmd+A selects everything, Escape deselects, and Delete
clears it. Transforms on the right rail act on the selection as one undo step:
flipping a block of cells turns the picture over (the cells swap places and
each flips), and a palette bank click or Priority applies to every selected
cell. In the background and overlay editors the selection belongs to the
Select tool: taking up a painting tool drops it, so the flips, Priority and a
bank click act on the selection while selecting and on the next stamp while
painting.

Ctrl/Cmd+C, X and V copy, cut and paste in every editor, through one app
clipboard that holds one kind of thing at a time: pixels, cells (which paste
between backgrounds and overlays), sprites, animation frames, a palette or a
single color (shared by the tileset editor's palette dock and the palette
editor). A pixel or cell paste follows the pointer until a click places it;
a sprite paste lands where it was copied from, selected; a frame paste goes
in after the selected frame. Ctrl/Cmd+D duplicates sprites and frames. In the
animation editor Space plays and pauses and the arrows step through frames.

One undo history covers the whole project, as a document's does in any
editor: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y), every rail's Undo and
Redo, and Edit ▸ Undo and Redo all step through the same edits, whichever
editor made them — an edit to a tile shows up wherever the tile is used, and
so does its undo. Every step is named: the Undo and Redo buttons say which one
they would take ("Undo Delete Background_2") and the status bar says what was
undone. Each step records only
the parts of the project its edit touched, so a large background's history
does not also carry every tileset. A new or opened project starts with an
empty history.

Run `npm run test:desktop:editing` for selection, flips, the clipboard and
undo in every editor.

Run `npm run test:desktop:navigation` for wheel panning and zooming around the
pointer, fit-on-open, the menu's commands, the tool letters, and image import.

### Overlay workspace

Structured like the background workspace, but fixed to 40×25 — no resize, no
`BGMODE`, no scroll, no camera panel. A Placeholders panel lists each
region by name; the selected one's `col`/`row`/`width`/`height` are in the
Placeholder panel docked on the right. A dedicated Placeholder tool
drags out a new one directly on the canvas, rejecting drags or field edits
that would overlap an existing placeholder or leave the 40×25 grid. Existing
placeholders render as labeled, click-through dashed outlines so they stay
visible without blocking painting. A tileset that is 1bpp gets its own plane
selector next to its picker list, independent for primary and alternate. The
same Pan tool as the background workspace scrolls the canvas at high zoom.

Run `npm run test:desktop:overlay` for overlay interaction, undo, placeholder
creation/edit/overlap rejection, plane preview, and docked layout checks at
1440- and 1024-pixel window widths.

### Background workspace

The tileset picker docks beside the canvas: a primary and an alternate list,
and a 16×16 tile map showing whichever one the "Show" selector points at.
Clicking a tile sets both the stamp's tile and which tileset it reads
(`CHR_ALT`) in one action; dragging picks a rectangular group instead, shown
in the stamp bar as "Group *w* × *h*". An Objects list below the picker
mirrors the tileset's own named selections (managed in the Tilesets editor)
as one-click shortcuts to re-pick a saved group. The pencil tool stamps a
picked group as a unit, each tile keeping its own authored palette bank
rather than one bank forced across the whole group, and mirrors it whole
when the stamp is flipped — the palette dock is
disabled while a group is picked, since there's no single bank to override.
Rectangle fill, flood fill and the eraser stay single-tile regardless of
what's picked, using just its top-left tile: stamping a whole group at every
cell a flood or a rectangle drag touches would paint it densely rather than
placing it once. The palette dock itself shows every bank's full 8 colors,
not one representative swatch, so two banks that only differ past color 1
don't look identical. Pencil, rectangle fill, flood fill, eraser and
eyedropper tools paint cells; a stroke or a rectangle drag is one undo step.
The Select tool marks a range of cells instead — "Selected *w* × *h*" in the
stamp bar — to copy, move, clear or edit as described under Selection and the
clipboard: a palette bank click or Priority changes every selected cell
without touching its tile or `CHR_ALT`, and a flip turns the block over. It's
how to recolor or turn over a placed picture without repainting it tile by
tile. Escape or the "Clear selection" button drops the range.
A Pan tool scrolls the canvas on drag instead of painting — needed once a
background is bigger than the window, since the canvas area scrolls
independently of the toolbar above it rather than growing past the window
and taking the toolbar's zoom controls with it. Space-drag or the middle
button pan too, whatever tool is active, matching the tileset editor.
A tileset that is 1bpp gets its own plane selector next to its picker list,
independent for primary and alternate — the picker and canvas re-render from
whichever page is chosen. A "toggle overlay" control in the Status panel
composites a chosen overlay asset over the inner (visible-screen) rectangle,
defaulting to plane 0 for any 1bpp overlay tileset.

Color 0 is opaque on the background layer: the canvas and its tile picker draw
it in each cell's own bank, as the hardware does (clementina-video-client's
`renderer.go` draws every background pixel through the palette, color 0
included). Only the overlay and sprites show what is behind color 0.

The canvas is native pixel size (`width × height × 8`), scrollable, and
zoomable in discrete steps, with a light grid at every tile boundary so an
empty cell reads as a place a tile goes rather than as featureless
background. Two nested rectangles preview the hardware, each dragged by its
own small handle that sits on top of the canvas without blocking painting
underneath it — both rectangles are click-through. The outer one (white)
shows any of the six `BGMODE` sizes against the canvas: what would be loaded
into the active `BGSET`'s physical tables; its handle sits at its top-left
corner rather than centered, so it stays reachable even when the outer and
inner rectangles are the same size and would otherwise stack both handles on
the same point. The inner one (yellow) is always the fixed 320×200 physical
screen, positioned within the outer one by `SCROLL_X`/`SCROLL_Y`: what is
actually visible. Scroll wraps at the mode's own pixel size, so the inner
rectangle can render as up to four pieces when it straddles both edges of
the loaded window at once.

A Status panel, opened from the rail like the Backgrounds and Tilesets
panels, is independent of dragging or of either rectangle's current
position — open it any time to read a color legend explaining what white
and yellow mean, then the register-level detail behind them: `BGMODE`,
`BGSET`, the loaded window's origin (in tiles, offset from the background's
top-left corner), `SCROLL_X`/`SCROLL_Y` (in pixels, updating live while
either handle is dragged), tileset names, and which physical table indices
the visible screen currently touches, computed the same way the real
renderer resolves them — useful for planning camera movement through a
level before any runtime streaming code exists to move it.

Run `npm run test:desktop:background` for background interaction, undo,
camera/scroll preview math, and docked layout checks at 1440- and
1024-pixel window widths.

### Animation workspace

The animation libraries dock beside the canvas so opening them does not cover the
preview, frame properties, or timeline. Select shapes with Ctrl/Cmd-click or
Shift-click, then append them as successive frames in library order. Only shapes
from the animation's tileset are offered.

The thumbnail strip supports selection, drag reordering, and Alt+Left/Right keyboard
reordering. The previous, play/pause and next controls sit above the timeline
(Space plays and pauses, the arrows step); pausing selects the displayed frame.
Edit the selected frame's shape, ticks and offset in the Frame panel docked on
the right, or drag on the preview to offset the pose. These edits preserve source shapes and
participate in undo/redo. Each frame still references one shape; simultaneous
independent actors belong to scene composition.

Run `npm run test:desktop:animation` for animation interaction and docked layout
checks at 1440- and 1024-pixel window widths.

Run `npm run test:desktop:audio` for the Sounds and Music editors: drawing
lanes and notes with real pointer input, selection, the clipboard, transforms,
undo, presets, song and instrument settings, playback, and docked layouts at
1440- and 1024-pixel window widths.

Run `npm run test:ui` for every Electron renderer suite, or `npm run test:all`
for unit tests plus UI tests. The workflow suite starts with an empty project and
uses native mouse input on visible, enabled, unobscured controls. It checks the
missing-shape guidance, tileset and shape creation, animation creation, frame
duplication, undo/redo, and play/pause without injecting project assets. The other
suites cover broader editor behavior and layouts with renderer-level fixtures.

Animations need a shape for their first frame. The empty animation workspace
explains this and offers **Go to Shapes**, which opens the shape creation controls.

GitHub Actions runs the combined suite on macOS for pushes and pull requests,
building the sibling `fran150/clementina-sdk` dependency first. UI screenshots are
uploaded as `ui-test-results`; the workflow test also writes a screenshot and error
report on failure. Locally these go in `test-results/` (override with
`STUDIO_CAPTURE_DIR`). Native file dialogs and full main-process save/open flows
are not covered by these renderer tests.
