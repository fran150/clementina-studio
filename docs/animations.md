# Sprite animations, version 1

Studio projects use `.cstudio` JSON with `format: "clementina-studio"` and
`version: 1`. They preserve CHR bytes, RGB565 palette words, bank modes,
editor planes, and named animations. Legacy `.mtb` files remain importable;
Save writes a new Studio project so animation metadata is not lost.

An animation has a name, CHR bank, 1bpp plane, and ordered frames. Each frame
has a duration of 1–255 ticks at 60 Hz and up to 64 sprite parts. Each part
contains tile, signed X/Y offsets, palette, and horizontal/vertical flips.
Zero color is transparent. Later parts cover earlier parts, matching the
current renderer. All concurrently displayed sprites share the hardware's
single sprite CHR bank and plane. Priority against background is not edited
in this version.

## Assembly export

`ANIMATIONS.BIN` is CPU-side animation data, not raw MIA OAM. Include it with
`.incbin "ANIMATIONS.BIN"` in the game and include `assets.inc` for names.
No absolute load address is assumed, so this asset does not have a PRG header.

Bytes:

- Header: ASCII `CSA1`, followed by one-byte animation count.
- Each animation: bank, plane, frame count (one byte each).
- Each frame: tick duration, part count (one byte each).
- Each part: tile, signed X offset, signed Y offset, palette, flags.
- Flags: bit 2 flip X, bit 3 flip Y; other bits zero.

`ANIM_<NAME>_OFFSET` points to the animation's bank byte, relative to the
start of ANIMATIONS.BIN. `ANIM_<NAME>_ID` is its zero-based ordinal.
Names are unique case-insensitively and limited to assembly identifiers.
Export rejects files larger than 65535 bytes.

The game must advance frames using a 60 Hz clock, add offsets to its entity
position, translate flags into OAM attributes, write parts to MIA OAM, and
hide unused parts when changing to a shorter frame. Studio's preview loops;
the assembly consumer chooses whether to loop. No playback routine is shipped
yet. The generated BASIC source loader still loads graphics/palettes only;
animations are linked into the assembly program by the game build.

## Editor

Create an animation, select tiles in its bank, then add parts or build a
16×16 group from a 2×2 selection in the 16-column tile sheet. Edit each part's
position, palette, and flips. Duplicate frames to build motion, set durations,
and press Play. Sprite edits have a separate 50-step undo history. Tile and
palette undo remain in the existing editor. Preview is 4× with a central
origin; large offsets may extend outside the preview viewport.
