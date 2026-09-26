# Studio project model

How Studio names things, what a project stores, and which parts reach the
generated files. This supersedes the palette and bank vocabulary used in
`docs/animations.md` and in the version 1 project format.

## Naming

Studio follows the hardware's vocabulary, which the ROM uses consistently in
`docs/basic-video.md`, `docs/memory-map.md`, and `src/basic/clementina_extra.s`.
The code carries these names as of project format version 2.

| Studio term | Means | Hardware |
| --- | --- | --- |
| palette | eight RGB565 colors, named, authored | the contents of one palette bank |
| palette bank | one of sixteen, numbered 0-15 | `PALETTE bank,index,…`, attribute bits 0-3 |
| color index | one of eight colors in a palette, 0-7 | `PALETTE bank,index,…` |
| palette RAM | all sixteen banks at once | `$00100`, indices `$90-$9F` |
| bank config | a named assignment of palettes to all sixteen banks | one palette RAM layout |
| tileset | 6144 bytes of CHR data, named, authored | the contents of one CHR bank |
| CHR bank | one of eight, numbered 0-7 | `CHRLOAD bank,…`, `BGBANK`/`SPRBANK` |
| sprite | one OAM entry: tile, offset, palette bank, flips | one 5-byte OAM record |
| shape | an ordered list of sprites drawn together | a run of consecutive OAM records |
| animation | a sequence of shapes with durations | successive OAM rewrites |

The word "slot" is not used. The word "bank" always carries its qualifier —
palette bank or CHR bank — because they are different things with different
counts.

Renames from the version 1 format: `BankAsset` becomes `Tileset`,
`bank.paletteSlots` is removed, `bank.cellPalettes` becomes
`tileset.tilePaletteBanks`, `bank.mode` becomes `tileset.bpp`, and
`bank.plane` is removed. The project format version becomes 2. Version 1
files are rejected rather than migrated; Studio is unreleased, and the `.mtb`
importer that read the pre-Studio flat format is gone with them.

## What the hardware actually constrains

The model below exists to match these, so they are worth stating plainly.

A tile carries no color. CHR data is bit planes of color indices 0-7. The
palette is chosen where the tile is *placed* — in a background cell's
attribute byte, or in an OAM entry — never in CHR memory.

Palette banks are global. All three layers share the same sixteen.

1bpp versus 3bpp is a property of the CHR bank, held in `CHR_1BPP_MASK`, one
bit per bank. A bank is entirely one or the other. At 1bpp a bank's 6144
bytes are three pages of 256 tiles; `CHR_1BPP_PLANES` picks which page each
*layer* reads, one plane per layer, not per cell.

Sprites read a single CHR bank (`SPRBANK`). An OAM entry has no bank field.
Everything on screen at once comes from that one bank, so from one tileset.

Backgrounds and the overlay read two CHR banks each, primary and alternate,
chosen per cell by attribute bit 7 (`CHR_ALT`).

Sprite-versus-sprite order is OAM index order: the renderer scans 0 through
`OAM_LAST_INDEX` and later entries overwrite earlier ones, so a higher index
draws on top. This is the opposite of the NES convention.

The sprite priority bit (attr bit 4) is a separate feature: it hides the
sprite wherever the background pixel is non-zero, putting the sprite behind
the background. A background cell's own priority bit (attr bit 6) removes
sprite pixels entirely and repaints over them. The full stack, bottom to top,
is background, then sprites, then priority background cells, then overlay.

Attribute bit layouts differ between background and sprites and are easy to
transpose. Background and overlay cells are palette 0-3, flip X 4, flip Y 5,
priority 6, `CHR_ALT` 7. Sprite `attr` is palette 0-3, priority 4, flip X 5,
flip Y 6; sprite `ext` is X high bits 0-1, Y high bit 2, disable bit 3.
Sprite X is 10-bit signed, -512 to 511; sprite Y is 9-bit signed, -256 to 255.

## Palettes

A project holds any number of named palettes, each eight RGB565 colors. There
is no limit; the sixteen is a property of the machine's memory, not of the
library.

A project also holds any number of named **bank configs**. A config assigns a
palette to each of the sixteen palette banks. A config is one palette RAM
layout — the thing a game loads when it enters a scene. Super Mario Bros.
would have an overworld config and an underground config: the same tiles and
the same bank numbers, different palettes behind them.

One config is **active**. The active config is what every editor previews
with. It is chosen freely and switched constantly while drawing, so it
belongs somewhere always reachable in each editor, not in a settings screen.
Which config is active has no effect on generated files.

Configs themselves are exported, because a config is what a palette file
contains. Sixteen palettes in bank order is 256 bytes, loadable in one call:
`PALLOAD 0,0,0,"OVERWORLD.PAL"`. Partial configs work the same way, since
`PALLOAD` computes `$00100 + bank*16 + offset` and transfers linearly across
bank boundaries.

## Tilesets

A tileset is a named 6144-byte CHR image — exactly one CHR bank's worth — laid
out as a 16 by 16 grid of tiles.

A tileset declares `bpp`, 1 or 3. This describes its own bytes and cannot be
inferred from them, so it lives on the asset. At 3bpp the tileset is 256
tiles of eight colors. At 1bpp it is three planes of 256 two-color tiles, and
every editor that shows it needs a plane selector; the color picker then
offers only color indices 0 and 1.

Each tile records the **palette bank** it was drawn against. This is
authoring metadata: it tells Studio which colors the author had in mind, and
it is what makes a tileset recolor correctly when a different config is
active. It is a bank number rather than a palette reference precisely so that
switching configs recolors the tileset — that is the overworld/underground
swap. It is not exported.

Because a tileset fills a whole bank and tile positions are fixed when the
author draws them, tiles never collide and there is no packing step. A
tileset maps one-to-one onto a CHR bank.

## Backgrounds

A **background** is a named grid of cells — a **width** and **height** in
tiles, freely chosen rather than fixed to a hardware `BGMODE` size, and a flat
array of cells the same length as `width × height`. Painting it works like the
tileset editor but for nametable and attribute data, and the canvas can be
panned and zoomed like any large map.

A background draws from exactly **two** tilesets, named **primary** and
**alternate**, matching the hardware: a background reads a primary and an
alternate CHR bank at once, and each cell's `CHR_ALT` attribute bit picks
which one it reads. `tilesetId` and `altTilesetId` are both required; naming
the same tileset for both is a valid way to use only one.

Each cell is `{tile, paletteBank, flipX, flipY, priority, chrAlt}` — the same
six fields `cellAttr()` already packed for background and overlay cells.
`paletteBank` defaults to the tile's authored bank at paint time, the same way
a shape's sprite does, and can be overridden per cell.

Resizing a background preserves existing cells anchored at the top-left:
growing pads new cells with the blank default, shrinking crops whatever no
longer fits.

The hardware's six `BGMODE` viewport sizes are a **preview aid**, not a canvas
limit, shown as two nested rectangles that model two different hardware
facts. The outer one is the `BGMODE`-sized window that would be resident in
the active `BGSET`'s four physical tables — what is loaded. The inner one is
the fixed 320×200 physical screen, positioned within it by `SCROLL_X`/
`SCROLL_Y` — what is actually visible. `SCROLL_X`/`SCROLL_Y` wrap at the
mode's own pixel size (`clementina-rom/docs/basic-video.md`), so the inner
rectangle wraps too, drawn as up to four pieces when it straddles both edges
of the loaded window at once. Each rectangle has its own color (white for the
loaded window, yellow for the screen) carried through to its drag handle, and
a togglable Status panel explains the legend and reads out the register-level
detail behind it: the mode, `BGSET`, the loaded window's origin, `SCROLL_X`/
`SCROLL_Y`, the tileset names, and which physical table indices the visible
rectangle currently touches — computed the same way
`clementina-video-client/internal/render/renderer.go`'s `bgTableAndLocal`
does, so the numbers match what the real renderer would show. All of this is
editor state, not exported, the same way the active bank config is a preview
choice; the one exception is that CHR bank *numbers* can never be shown here
regardless, since a tileset is not assigned to a physical CHR bank until the
build step exists — the panel names tilesets, not banks.

Turning an authored background into something that streams onto real hardware
— chunked across the eight physical nametable/attribute tables, with runtime
loading and scrolling — is a **build step** concern, not modeled by the
background asset itself. See "Build step" and "Deferred" below.

The background editor can also **toggle an overlay preview**: pick an overlay
asset and it composites over the inner (currently visible) rectangle, since
the overlay always sits on the physical screen 1:1 regardless of background
scroll — see "Overlays" below. This is preview-only, like everything else in
this section.

## Overlays

An **overlay** is the fixed hardware text/HUD layer: 40×25 cells, always —
there is no `BGMODE` equivalent and it never scrolls. Otherwise its cell
shape and editing model are identical to a background's: it draws from a
**primary** and **alternate** tileset via `CHR_ALT`, each cell is the same
`{tile, paletteBank, flipX, flipY, priority, chrAlt}` `cellAttr()` packs, and
it has its own bank pair, `OVLBANK`/`OVLALT`, matching `BGBANK`/`BGALT`'s
shape. Priority has no visible effect here — the overlay always draws last,
on top of everything (see "What the hardware actually constrains") — but the
bit is still stored, the same way every cell field is.

A **placeholder** is a named rectangular region on the grid —
`{id, name, col, row, width, height}` — and nothing else. It carries no
content of its own: whatever is painted in its cells with the normal tools
*is* the overlay's real initial data, not a discardable mockup. Placeholders
may not overlap and must lie within the 40×25 grid. Their purpose is for a
future build step to generate a primitive per placeholder — something like
`SetPlaceholder_<Name>(tileIds)` — that overwrites just the tile-ID bytes in
that region, left to right then top to bottom, leaving every other attribute
(palette, flips, priority, `CHR_ALT`) as authored. Mapping a value — a score,
a string — to a tile-ID stream is the programmer's problem, not Studio's.

## Shapes and animations

A **shape** is one static arrangement of sprites — a four-by-four hero, an
eight-by-eight boss, a single pickup. A **sprite** is one OAM entry: a tile,
an X and Y offset from the shape's origin, a palette bank, and flip X and
flip Y. So a shape is an ordered list of sprites, and that is exactly what
gets written to OAM.

A shape draws from exactly **one** tileset, because all sprites share one CHR
bank.

Order is the list's order, which becomes OAM index order, and a higher index
draws on top. Bring-to-front moves a sprite to the end of the list. There is
no separate sprite id: the array position *is* the offset from whatever OAM
index the shape is loaded at.

A sprite's palette bank defaults to the one its tile was drawn against and can
be changed per sprite, which is how one tileset yields a red enemy and a blue
one.

An **animation** is a sequence of `{shape, ticks}` entries, plus an optional
per-entry flip and X and Y offset applied to the whole shape. It references
shapes rather than copying them, so editing a shape updates every animation
using it; duplicate a shape when you want one to diverge. The per-entry offset
exists so that a body bobbing one pixel does not need a second shape, and the
flip so that a mirrored pose does not either: it mirrors the shape about its
origin by toggling each sprite's flip bit and moving it from `x` to `-x - 8`.

Every shape in one animation must name the same tileset: they are displayed in
sequence out of the single sprite CHR bank.

This is why a shape needs no per-frame ordering. A limb that passes in front of
a torso partway through a walk is two shapes built from the same tiles in a
different order — and since a game rewrites the OAM records each frame anyway,
two shapes that differ in order cost no more than two that differ in position.

Sprite-versus-background priority is not set here. Nor is the choice of which
shapes share a CHR bank, or which shape loads at which OAM base. Those are
scene decisions.

## Audio

Sound effects, songs and the instruments songs play are MIA audio assets,
modeled on the chip's four voices, its background sequencer and the voice
registers a program writes. They are described in **[audio.md](audio.md)**:
what the hardware has, why sound effects and music are two editors, what a
song compiles to, and how closely the preview follows the firmware.

## Authoring versus output

Exported: palettes, bank configs, tileset CHR bytes, each sprite's tile,
offsets, flips and palette bank, the order of sprites within a shape, an
animation's shape sequence with its durations and offsets, a background's
width, height, two tileset references, and its cells, and an overlay's two
tileset references, its cells, and its placeholders' geometry. For audio,
each song's sequencer tracks and each sound's frame writes (see audio.md).

Not exported: a tile's recorded palette bank, which config is active, preview
backgrounds, a background's viewport preview mode, `BGSET`, scroll position,
and overlay-preview toggle, and every editor's 1bpp plane choice; in the audio
editors, the voice being drawn on, mutes, the cursor and snap.

Never stored on an asset: `CHRMODE`, `CHRPLANE`, `BGBANK`/`BGALT`,
`SPRBANK`, `OVLBANK`/`OVLALT`. These are global render state and belong to
the build step. The one exception is `bpp`, which is generated *from* the
tileset rather than set independently, because it describes the tileset's own
encoding. The 1bpp plane on screen is editor state too — the tileset editor
and every editor that reads a tileset (background, overlay, shapes) each
hold their own plane choice independently, none of it stored on the tileset.

## Build step

Not written yet, and deliberately last: it waits on maps and scenes, so
that it lays out all of a project's assets rather than being rebuilt each time
a new kind arrives. The export path and its UI were removed rather than carried
half-finished.

When it lands, it is where the user lays out Clementina's memory and chooses
files. It assigns tilesets to CHR banks, groups palettes into files, names
the outputs, and selects which runtime routines to include.

It can report two things cheaply. Two tilesets of different `bpp` assigned to
the same CHR bank is a genuine conflict, since `CHR_1BPP_MASK` holds one bit
per bank. And a config that a scene's placements do not agree with is worth
flagging once the scene editor exists.

The runtime routines should live in the ROM repository or a shared library,
not in Studio. They depend on hardware constants — the OAM base, the five-byte
entry stride, the index window numbers, the `$C0-$DF` direct range covering
only sprites 0-31 — which track the firmware, not the editor. Studio
references modules by name. Today `bankAssetPackage` hardcodes the palette RAM
base as decimal 256 in a generated loader, which is the drift this avoids.

Two routines are needed early and are easy to omit. Loading a group at OAM
index X must raise `OAM_LAST_INDEX` when the group extends past it, or the
renderer never scans those entries. And OAM needs a clear routine that sets
the disable bit across the range, because every entry up to `OAM_LAST_INDEX`
is drawn whether or not anything wrote it.

## Preview fidelity

Color index 0 is drawn on background cells and transparent for sprites and
the overlay. The tileset editor needs a switch between the two readings.

What shows through a transparent pixel is not a flat color but whatever is
behind it — the background layer, or `BACKDROP_COLOR` where there is none.
The tileset editor can approximate this with a single color, but that color
should be a pick from palette RAM rather than a free hex value, since
`BACKDROP_COLOR` is itself a palette selector: bits 3-6 choose the bank,
bits 0-2 the color index, and `BCOLOR n` is `(n<<3)|1`. A free value can show
a background the machine cannot produce. The sprite and scene editors should
composite against the real layers.

## Deferred

A **scene editor** combines backgrounds, shapes, and a bank config into
one screen, and is where the remaining validations belong: that every shape in
a scene draws from the same tileset, that OAM bases give the intended
cross-shape priority, and that the scene's config matches what its placements
assume. Sprite-versus-background priority bits are set here.

Packing several tilesets into one CHR bank, with tile indices rebased at build
time, is possible but unnecessary while a tileset is a whole bank.

## Open questions

Whether an animation's shapes may span more than one tileset. They cannot be
displayed in sequence from a single sprite CHR bank unless a game rewrites
`SPRBANK` between frames, which affects every sprite on screen. The model
above forbids it; a game doing raster tricks would want it back.

Whether the tileset editor's preview background should be a `(bank, index)`
pick from palette RAM rather than a free hex value. `BACKDROP_COLOR` is itself
a palette selector — bits 3-6 pick the bank, bits 0-2 the color index — so a
free value can show a background the machine cannot produce.
