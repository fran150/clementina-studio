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

## Sprite groups

A sprite group is a character or object assembled from tiles — a four-by-four
hero, an eight-by-eight boss. It draws from exactly **one** tileset, because
all sprites share one CHR bank.

A group owns an **ordered list of sprite slots**. Order is the group's, not a
frame's: slot order becomes OAM index order, and a higher index draws on top.
Bring-to-front moves a slot to the end of the list. Keeping order at the
group level means a sprite holds its identity across frames and cannot pop in
front of its neighbours mid-animation.

Each frame says what every slot draws: tile, X and Y offset from the group's
origin, flip X, flip Y, and the palette bank. The palette bank defaults to
the tile's recorded bank and can be overridden per sprite, which is how one
tileset yields a red enemy and a blue one. A frame also carries a duration in
ticks.

Sprite-versus-background priority is not set here. Nor is the choice of which
groups share a bank, or which group loads at which OAM base. Those are scene
decisions.

## Authoring versus output

Exported: palettes, bank configs, tileset CHR bytes, and per-sprite tile,
offsets, flips, palette bank, and slot order.

Not exported: a tile's recorded palette bank, which config is active, and
preview backgrounds.

Never stored on an asset: `CHRMODE`, `CHRPLANE`, `BGBANK`/`BGALT`,
`SPRBANK`, `OVLBANK`/`OVLALT`. These are global render state and belong to
the build step. The one exception is `bpp`, which is generated *from* the
tileset rather than set independently, because it describes the tileset's own
encoding. The 1bpp plane on screen is editor state too, held by the tileset
editor rather than the tileset.

## Build step

Not written yet, and deliberately last: it waits on maps, scenes and music, so
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

A **background editor** works like the sprite editor but for nametable and
attribute data. It draws from up to two tilesets, since a background reads a
primary and an alternate CHR bank with `CHR_ALT` choosing per cell. Cells are
arranged by `BGMODE` across up to eight 40 by 25 tables rather than placed
freely.

A **scene editor** combines backgrounds, sprite groups, and a bank config into
one screen, and is where the remaining validations belong: that every group in
a scene draws from the same tileset, that OAM bases give the intended
cross-group priority, and that the scene's config matches what its placements
assume. Sprite-versus-background priority bits are set here.

Packing several tilesets into one CHR bank, with tile indices rebased at build
time, is possible but unnecessary while a tileset is a whole bank.

## Open question

Frame-level versus group-level sprite ordering is written above as
group-level. If a frame genuinely needs its own order — a limb passing in
front of a torso partway through an animation — order moves into the frame and
sprite identity across frames is lost. Group-level is the assumption until
that case turns up.
