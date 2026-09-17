# Sprite groups and animations

A **sprite group** is a character or object assembled from one tileset's tiles.
It draws from exactly one tileset because Clementina has a single sprite CHR
bank (`SPRBANK`) and an OAM entry carries no bank field, so everything on
screen at once comes from the same tileset.

A group has a name (a unique assembly identifier), the tileset it draws from,
a canvas size, an origin, and ordered frames. Each frame has a duration of
1-255 ticks at 60 Hz and up to 64 sprite parts. A part carries a tile index,
signed X and Y offsets from the origin, a palette bank, and horizontal and
vertical flips.

Static sprites hold exactly one frame; animations hold up to 255.

Color 0 is transparent for sprites. Higher sprite IDs draw on top, matching the
renderer, which scans OAM from 0 to `OAM_LAST_INDEX` and lets later entries
overwrite earlier ones — the opposite of the NES convention.

A part's palette bank defaults to the bank its tile was drawn against in the
tileset, and can be changed per sprite. That is how one tileset yields a red
enemy and a blue one. OAM carries X as 10-bit signed (-512 to 511) and Y as
9-bit signed (-256 to 255), with the high bits in the `ext` byte.

Sprite-versus-background priority (`attr` bit 4) is not edited here. It belongs
to the future scene editor, along with which groups share a CHR bank and which
group loads at which OAM base. See [model.md](model.md).

## Editor

Create a group, pick its tileset, then select tiles from the tile map and place
them around the origin. Drag to move, arrows nudge by a pixel, and the
bring-to-front and send-to-back controls reorder sprite IDs. The tileset is
locked once a group has parts, since changing it would repoint every tile index
at different graphics.

Animations add a frame timeline: duplicate frames to build motion, set
durations, and press Play. The preview is 4× with a central origin; large
offsets may extend outside the preview viewport. Studio's preview loops; a game
chooses for itself.

Sprite edits keep their own 50-step undo history, separate from tileset and
palette edits.

## Export

There is none yet. The build step that will write sprite data and assembly
symbols comes after maps, scenes and music, so that it lays out a whole
project at once. See [model.md](model.md).
