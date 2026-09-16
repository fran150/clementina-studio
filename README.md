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

A bank binds only the palettes it actually uses, up to the sixteen the hardware
holds at once, and the dock shows one row per bound slot rather than a fixed
sixteen. **+ Palette slot** binds another project palette; a slot no tile paints
can be released from its dropdown, and the tiles above it follow their palettes
down. Hovering a drawing cell highlights its
palette; clicking a swatch assigns its palette to the last hovered cell and
selects the ink. Double-click opens the native color editor. The previous
paint/palette mode switch is gone.

Palettes belong to the project, not to a bank. MIA has one palette RAM of 16
slots shared by background tiles, sprites and the overlay, so the Studio stores
a project-wide palette library and each bank records only which library palette
occupies each slot it binds. A tile still stores a 4-bit slot index, which is
why a bank can address at most 16 palettes at once; the library itself is
unbounded, because a game can reload palette RAM whenever it swaps scenes.

Editing a color therefore changes it in every bank bound to that palette, and a
new or imported bank starts from the palettes already on screen instead of
resetting to defaults. Each slot's dropdown names its palette, marks the ones
shared with other banks, renames them, and forks a private copy when one bank
needs to diverge.

Two slots of one bank never hold the same palette, and validation enforces it:
both would load identical colors into two of the sixteen hardware slots, and
tiles painted with each would be indistinguishable in the dock while still
counting separately. Choosing a palette another slot of the bank already holds
therefore swaps the two slots — marked `↔ NN` in the dropdown — rather than
duplicating it. Tiles keep their slot number, so their colors swap with it.

Projects saved before palettes became project-level migrate on open: identical
palettes across banks collapse into one shared entry, and exported `.PAL` bytes
are unchanged.

A sprite part names its palette outright rather than borrowing a slot number
from its source bank. Slot numbers are per bank, so two parts drawn from
different banks could both claim "palette 3" while showing different colors —
something the hardware cannot do, since every sprite indexes the one palette
RAM. Parts therefore carry `paletteId`; mapping those palettes onto the 16
hardware slots belongs to the same memory-placement step that already allocates
CHR banks, and that is where "this group needs a seventeenth palette" is
reported. Legacy parts with no source bank keep a plain 0–15 slot.

The Palettes workspace follows the same shape as the bank and sprite group
editors: an icon rail (palette list, New, Duplicate, Delete), a collapsible
asset list, and a stage. The list uses the same rows as the bank library —
click to select, double-click or F2 to rename inline, with unused palettes
dimmed. The stage shows the selected palette's eight colors as large swatches
with their RGB565 values; click one to edit it. The header names the palette and
reports where it is used — which bank and slots, and how many sprite parts. A
new palette starts as a rainbow so its inks are distinguishable while drawing;
color 0 keeps the backdrop, being the transparency key rather than an ink.

Deleting a palette that is still in use asks which palette its references should
move to, then repoints every bank slot and sprite part onto that replacement, so
a binding is never left dangling. Where that leaves a bank holding the
replacement in two slots, the duplicate is dropped and its tiles follow the
survivor, so a bank never spends two of its sixteen hardware slots on identical
colors. The whole reassignment and the deletion are one undo step. Ctrl/Cmd+Z works here and shares the bank
editor's history — which folds sprite groups into its snapshot only for edits
that actually repoint them, so ordinary drawing can never revert sprite work.

Color 0 is editable here. It is exported like any other entry, and background
tiles draw it as a real color, while sprites and the overlay treat it as
transparency — so it was previously shipped in every `.PAL` with no way to
change it. The drawing canvases still preview it as the bank's preview
background; showing it as its true color for background work is still open.

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
then right-drag the selected tiles onto the canvas. Alternatively, right-click
to pick up the selection and click its destination. Each part keeps its bank's stable identity,
tile index, palette, signed pixel offsets and horizontal/vertical flip flags.
Renaming a bank keeps references intact; deleted banks display missing-part
markers. Tile graphics changes are reflected when the composition is redrawn.

The width/height fields define the canvas in tiles or pixels, up to 320 × 200
pixels. The bottom-right handle resizes it. Tiles outside a resized canvas are
retained and reported in the status line, while the preview clips to the canvas. Drag parts freely, enable **Snap
8 px** when useful, or use arrows for one-pixel nudges. Shift-click and rectangular
selection on empty space select multiple parts; Ctrl/Cmd+A selects all. Exact
X/Y fields move the selection together. Group flips mirror both placement and
tile pixels. Higher sprite IDs draw on top. The Sprite IDs panel edits unique IDs within the
group; Lowest IDs / Highest IDs reorder a selection. Final hardware-slot
allocation remains part of the future build workflow.

The crosshair marks the sprite origin. Top-left, Center and Bottom-center presets
refer to the editing area; **Place origin** allows an arbitrary pixel position.
Changing the origin recalculates offsets while keeping the composition in place.
Origin presets stay attached to the canvas when it is resized; custom origins
retain their proportional canvas position.
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

Tile drawing controls include a filled-shape toggle and solid, checkerboard,
and horizontal-stripe fill patterns in the right toolbar. Patterns apply to
bucket fills and filled rectangles/ellipses; skipped pattern pixels retain their
existing values. Pattern controls enable for the relevant tools. Palette slots
are laid out four per row so each row can name its palette, with horizontal
scrolling on narrow windows; the dock is as tall as the bank's bound slots need.
Buttons and settings icons show quick hover/focus tooltips. Paste and display
settings use compact popups; the clipboard-and-gear icon opens paste options.


### Sprite groups workflow

The Sprite groups workspace uses collapsible bank/group and sprite-ID panels,
an icon tool rail, and a compact bounded canvas. Left-drag in the bank map to
select tiles. Right-click that selection to pick it up, then click the canvas,
or hold the right button and drag directly from the map to the canvas. A floating preview follows the pointer throughout placement. New placements must fit in the canvas.

The composition has no palette selector: placed tiles inherit their bank-map
palette assignments. Group origins use canvas-relative presets or custom points.
The canvas can be sized in pixels or tiles, or resized with its cyan corner
handle. Existing sprites outside a shrunken canvas are kept so resizing is
reversible. The hardware renderer draws ascending sprite IDs, with higher IDs
overlaying lower ones; IDs here are local to a group pending final allocation.


### Sprite group editing refinements

The group library and tile selector have separate toolbar panels. Groups use a
single list with New/Duplicate/Delete and inline renaming by double-click or F2.
The tile panel manages up to eight source-bank assets for the selected group;
its bank selector only offers those assets. Used banks cannot be removed until
their sprite parts are removed. These are authoring references, not hardware
slot assignments: the current MIA format has eight resident CHR banks but one
shared SPRITE_CHR_BANK register for all sprites. Packing and final allocation
remain deferred to the build workspace.

Selected tiles follow the pointer as a floating placement preview, with a red
border for an out-of-canvas placement. Escape cancels. Drag the yellow origin
cross directly; it stays visible outside the canvas clip, including at borders,
and changing it preserves the composition's position. Origin presets are icons
with tooltips. Wheel zoom is continuous and anchored at the pointer. Dragging
the canvas resize handle rounds to whole tiles in tile units, and to individual
pixels in pixel units.
