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
tilesets, build shapes from their tiles, then sequence shapes into animations.
The active config is a preview choice, switchable from the header in every
editor; it does not change what a project stores.

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
  `image-import-ui.js` (artwork import). They load after the shell and wrap its
  `showView`/`redrawAll`, so the shell boots them via `bootStudio()`.
- `packages/assets`: the project format, its validators, and the attribute
  encoders.
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
tilesets, the shapes, and the animations that sequence them. Version 1 files are rejected:
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
cell shape and paint tools as backgrounds. A **placeholder** is a named
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

Shape and animation edits share a 50-step undo history, separate from tileset
and palette edits. Backgrounds and overlays each keep their own independent
50-step history.

## Tests

`npm test` compiles the TypeScript and runs the model tests: the project
format, its validators, palette and config behavior, background and overlay
validation, the two attribute bit layouts, and image import.

`npm run test:desktop` drives the real renderer in Electron and covers the
model end to end — that a tile records a bank and recolors with the config,
that a 1bpp tileset's planes are independent, that configs can be created and
switched, that deleting a palette repoints the banks holding it, and that a
project round trips through save and restore.

## Not yet built

A scene editor, music and sound effects, the build step, and the runtime
routine library. `docs/model.md` records what each will need and which
hardware constraints they have to respect — notably that a scene is where
co-residency and sprite-versus-background priority get decided, and where an
authored background's mapping onto physical hardware tables and runtime
streaming will eventually be handled.

Shared UI conventions and extension points: **[docs/editor-shell.md](docs/editor-shell.md)**.

### Overlay workspace

Structured like the background workspace, but fixed to 40×25 — no resize, no
`BGMODE`, no scroll, no camera panel. A Placeholders panel lists each
region's name and `col`/`row`/`width`/`height`; a dedicated Placeholder tool
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
rather than one bank forced across the whole group — the palette dock is
disabled while a group is picked, since there's no single bank to override.
Rectangle fill, flood fill and the eraser stay single-tile regardless of
what's picked, using just its top-left tile: stamping a whole group at every
cell a flood or a rectangle drag touches would paint it densely rather than
placing it once. The palette dock itself shows every bank's full 8 colors,
not one representative swatch, so two banks that only differ past color 1
don't look identical. Pencil, rectangle fill, flood fill, eraser and
eyedropper tools paint cells; a stroke or a rectangle drag is one undo step.
A Select tool marks a range of already-painted cells instead — dragging it
shows "Selected *w* × *h*" in the stamp bar, and clicking Flip X/Y, Priority
or a palette bank then edits every marked cell's attribute in place as one
undo step, never touching its tile or `CHR_ALT`. It's how to recolor or
reflip a placed shape after the fact without repainting it tile by tile.
Escape or the "Clear selection" button drops the range.
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
preview, frame properties, or timeline. Select poses with Ctrl/Cmd-click or
Shift-click, then append them as successive frames in library order. Only shapes
from the animation's tileset are offered.

The thumbnail strip supports selection, drag reordering, and Alt+Left/Right keyboard
reordering. Previous/next and play/pause controls navigate the sequence; pausing
selects the displayed frame. Edit ticks and offsets in the selected-frame row, or
drag on the preview to offset the pose. These edits preserve source shapes and
participate in undo/redo. Each frame still references one shape; simultaneous
independent actors belong to scene composition.

Run `npm run test:desktop:animation` for animation interaction and docked layout
checks at 1440- and 1024-pixel window widths.

Run `npm run test:ui` for all six Electron renderer suites, or `npm run test:all`
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
