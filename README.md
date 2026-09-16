# Clementina Studio

Development tools for creating Clementina games and programs.

## Scope

- Desktop editors for tiles, palettes, composite sprites, animations, maps,
  music, and sound effects.
- Shared asset converters and command-line build tools.
- BASIC tokenizer and generated runtime asset loaders.
- A future VS Code extension for Clementina BASIC.

Game assembly remains in its own repository and uses ca65/ld65, matching
Clementina ROM's toolchain. Studio is planned as a TypeScript workspace with
an Electron desktop application; the initial tile editor and asset export implementation is available.

## Normal workflow

Edit a project, export runtime assets and a small tokenized BASIC loader,
then load the package on Clementina. The loader populates CHR banks,
palettes, and other MIA memory, and launches the assembly game's PRG.

PRG files use Clementina's CPU-memory load format. Assets destined for MIA
memory use the existing runtime loading formats; do not assume that a PRG
header can describe MIA destinations. Raw binary files can be runtime assets.

Exporting replacement firmware-default characters or graphics is an advanced,
rarely used feature, not the normal game-development workflow.

## Planned organization

- `apps/desktop`: asset studio.
- `apps/vscode`: BASIC extension.
- `packages/project`: project format and validation.
- `packages/assets`: asset conversion and binary export.
- `packages/basic`: tokenization and loader generation.
- `packages/cli`: command-line tools shared with automated builds.
- `examples`: small end-to-end examples.

Add these components as needed. The first milestone is editing a character,
building its assets, and displaying it animated in Clementina.

## Companion repositories

Paths below are relative to this checkout in the development directory layout:

- `../../assembler/clementina-rom`: kernel, BASIC, runtime file-format
  documentation, and the existing `tools/tile-editor.html` reference.
- `../../pico/clementina-mia`: authoritative hardware definitions and
  graphics/audio memory layouts.
- `../../go/clementina-6502`: emulator and CPU-visible behavior verification.

Preserve import compatibility with the existing editor's `.mtb` projects
when implementing the new graphics editor. Verify generated BASIC files
against the actual ROM tokenizer and SAVE/LOAD behavior.

## Initial implementation

Requires Node.js 22+ and npm. Run `npm install`, then `npm start`.
`npm test` compiles the TypeScript code and tests asset encoding/export.

The first desktop version reuses the ROM repository's tile editor, with
native Studio project Open/Save/Save As and legacy MTB import and runtime package export. Existing
painting, palettes, transforms, undo/redo, and MTB import remain available.
Exports create a unique directory containing full CHR banks, individual
palettes, and `LOADER.bas.txt`. This is BASIC **source**, not a tokenized
LOAD-ready file. Tokenization, music, maps,
and VS Code integration are still planned. No emulator launch is wired yet.

Runtime packages currently include all banks and palettes. Running their
loader can change console graphics; choose layer banks/planes in your game.

Run `npm run test:desktop` for the hidden-window Electron smoke test.

## Composite sprites and animation

The sprite panel below the tile editor supports named animations, bank/plane
selection, 16×16 tile groups, editable parts, frame duplication and duration,
looping playback, and sprite undo. Save as `.cstudio` to preserve graphics and
animation metadata. Export includes `ANIMATIONS.BIN` and `assets.inc` for the
assembly game. See [animation format and workflow](docs/animations.md).

## Editor workflow

Use the sidebar: **Palettes → Tile sheets → Sprites → Animations → Build**.
Only the selected editor is displayed. Sprites are reusable static frames;
animations copy frames from that library and retain independent timing and
parts. Existing animation-only Studio projects still open. Advanced raw
exports are separate from the normal runtime Build screen.

Build also exports `SPRITES.BIN` and `sprites.inc`. Static sprite data uses
the CSA1 layout with one frame per sprite, and `SPRITE_<NAME>` symbols.
Music, maps, scenes, named bank allocation, and tokenized loader generation
remain future work. The current Build screen exports all banks/palettes.

## Named banks and rectangular drawing

Banks now have independent filenames instead of fixed runtime slots. New and
Duplicate grow the library beyond eight assets. Legacy projects are migrated
into named banks when opened. The bank page includes editable palettes.

Drag a rectangle on the 16×16 bank map. The selected canvas spans all selected
tiles, so a 6×6 selection is 48×48 pixels. Pixel strokes cross tile boundaries.
Choose Assign palettes to paint palette indexes onto cells, or apply a palette
to the whole selection. Save named selections to preserve reusable rectangles.
Bank edits have their own undo/redo controls.

Each named bank exports CHR, PAL, ATTR, composition JSON, and an independent
BASIC source example. Palette assignment is authoring metadata; the ATTR file
is not a ready-made background map or OAM. Example loaders use slot 3 and load
all palettes; adapt them for your game. Existing sprite/animation editors still
use legacy slot-backed graphics. Binding them to named assets is the next
integration step. Legacy raw exports remain tied to the imported slot data.

## Bank editing controls

New projects start empty. Import PRG strips Clementina's 2-byte unbanked or
3-byte banked CPU load header and accepts exactly 2048 (1bpp, plane 0) or
6144 (3bpp) CHR payload bytes. This is a graphics-data PRG importer, not an
extractor for arbitrary executable PRGs. CPU load addresses do not bind the
asset to a CHR slot. Bank deletion asks for confirmation and can be undone.

All 16 palettes appear together. Hovering a drawing cell highlights its palette;
clicking a swatch assigns its palette to the last hovered cell and selects the
ink. Double-click opens the native color editor; edits affect every use of that
palette color within the bank. The previous paint/palette mode switch is gone.

Objects save named rectangles within a bank. New saves the current selection;
selecting an object restores it. Confirmed deletion removes only metadata.
Drawing zoom ranges from 1× to 32×. Pencil draws across tile edges; Fill replaces
connected matching color indexes inside the selected rectangle and is undoable.
The preview background substitutes for color index 0 in both canvases, is saved
as an editor preference on the bank, and does not alter exported palette bytes.

## Centered drawing workspace

The bank editor now centers the drawing canvas. The left rail opens Banks,
Objects, and Tile map flyouts only when needed. Pencil (B), Eraser (E), Fill
(G), and Pick color (I) remain accessible. Palettes are docked at the bottom.
The separate drawing-color chip stays selected while hovering other tiles.
Hover highlights only the palette under the cursor; selecting a swatch does
not edit the project. Painting applies the selected palette to touched tiles.
Erasing clears pixels without changing their palette assignments.

Window close, Command-Q, and Control-Q use Save / Discard / Cancel for unsaved
projects. Canceling Save or a write failure keeps the project open. The former
browser beforeunload handler no longer silently prevents Electron from closing.

## Drawing refinements

Objects and the tile map share a flyout. Double-click a bank or object row to
rename it inline (Enter commits, Escape cancels). New objects receive an
editable default name. Tool buttons are icons with tooltips and accessible
labels. Line, rectangle, and ellipse tools preview while dragging, commit on
release, and undo as one operation. Wheel scrolling over the drawing area
zooms around the pointer within 1×–32×; scrolling in panels remains normal.

Amber outlines identify the selected drawing palette; a white border marks
the ink. A cyan outline shows the hovered tile's palette without changing the
selection. The miniature button beside Display settings opens a live preview
of the current selected object/rectangle, independent of drawing zoom.

### Color and pixel clipboard

Color 00 is displayed with a red-slash transparency symbol. It erases pixels and
cannot be edited or used as a palette-color clipboard destination. Select a
nonzero swatch, use **Copy color**, select a destination swatch, and use **Paste
color** to copy its RGB565 value. This updates every use of that palette entry
and supports Undo. The drawing color has an individual border; the cyan palette
border identifies the tile under the pointer.

Use **Pixel selection (S)** to drag a rectangular pixel region, then the toolbar
Copy and Paste buttons. Move the pointer to position the preview and click to
place it; Escape cancels. Zero pixels are skipped, so existing pixels show
through. Pasting copies color indices and preserves destination tile palettes;
colors can therefore differ between tiles. Paste is clipped to the drawing area
and can be undone. The internal clipboard works across banks in the open app.
Ctrl/Cmd+C and Ctrl/Cmd+V operate on colors after selecting a swatch, or on pixels
when the pointer is in the drawing area. Text fields retain normal text shortcuts.

### Selection transforms and navigation

With the selection tool active, drag inside a pixel selection to move it, or
nudge it one pixel with the arrow keys. Movement preserves destination palettes
and skips transparent pixels. Flip horizontally/vertically or rotate clockwise
90° using the selection controls. Rotation is rejected if the result would not
fit within the drawing area. Each completed operation supports Undo.

Enable **Filled shapes** for solid rectangles and ellipses. Hold Shift while
drawing to constrain a square or circle. Hold Space and drag (or use the middle
mouse button) to pan without painting. **Fit** chooses a whole-pixel zoom that
fits the canvas, down to 1×; **100%** displays one screen pixel per drawing pixel.

**Paste options** selects transparent or opaque pasting, and destination or
source palettes. Opaque pasting includes zero pixels. Source palettes reuse
matching palette entries or allocate slots not referenced by any tile. If none
are available, paste is blocked with an explanation. When different source
palettes land in one destination tile, the first included source pixel supplies
that tile's palette. The preview shows recoloring of the entire affected tile.

The status strip shows the pointer's pixel coordinates relative to the drawing,
the bank tile number, its palette, pixel-selection dimensions, and canvas size.

In the drawing area, **Ctrl/Cmd+V** pastes using destination palettes;
**Ctrl/Cmd+Shift+V** pastes using source palettes. Both show a placement preview
before you click. These shortcuts update the visible source-palette option;
the toolbar Paste button uses the current paste options.

### Finishing controls and recovery

Palette counts show how many tiles in the current bank reference each palette,
including blank tiles. Hover or keyboard-focus a count to open the bank map and
highlight matching tiles; a dash means unused (also described in its tooltip).
Ctrl/Cmd+A selects the whole drawing. At editing zoom levels, drag the four
corner handles to resize the pixel selection without changing pixels. The **?**
button or question-mark key opens shortcut help.

Studio keeps an independent whole-project recovery snapshot in its application
user-data `recovery` directory. It writes after about two idle seconds, or every
ten seconds during continuous edits. Snapshots include unnamed projects and all
project assets. Writes replace the previous snapshot atomically. On startup,
snapshots left by exited sessions offer Recover, Discard snapshot, or Later.
Recovery opens as an unsaved project; normal Save/Save As remains explicit.
A successful save or confirmed clean close/discard removes the current session's
snapshot. Running sessions have separate snapshots and are left alone.

### Free-positioned sprite composer

The Sprites workspace assembles references to tiles from named graphics banks.
Create a sprite, select a rectangle in the bank map (or choose a saved Object),
then drag the selection preview onto the canvas. Alternatively, click **Place
selection** and click its destination. Each part keeps its bank's stable identity,
tile index, palette, signed pixel offsets and horizontal/vertical flip flags.
Renaming a bank keeps references intact; deleted banks display missing-part
markers. Tile graphics changes are reflected when the composition is redrawn.

The width/height fields define a starting editing area in tiles, not clipping
bounds. Parts may overlap or extend outside it. Drag parts freely, enable **Snap
8 px** when useful, or use arrows for one-pixel nudges. Shift-click and rectangular
selection on empty space select multiple parts; Ctrl/Cmd+A selects all. Exact
X/Y fields move the selection together. Group flips mirror both placement and
tile pixels. Later parts draw on top; use Send to back / Bring to front to reorder.

The crosshair marks the sprite origin. Top-left, Center and Bottom-center presets
refer to the editing area; **Place origin** allows an arbitrary pixel position.
Changing the origin recalculates offsets while keeping the composition in place.
The status line reports content bounds; Fit, wheel zoom, Space-drag panning,
grid/background controls and the miniature help inspect the result. Undo/Redo
covers composition edits. Double-click the displayed sprite name to rename it.

Logical-bank parts use signed 16-bit authoring offsets and currently retain the
64-part limit. These definitions save in the project and its recovery snapshots.
Animation's existing preview resolves their logical bank references, but its
workspace has not been redesigned in this phase. Runtime export of logical
sprite definitions is deferred to the future memory-placement/build workspace;
the older hardware-slot exporter explicitly rejects them instead of emitting
incorrect bank numbers or truncated coordinates.
