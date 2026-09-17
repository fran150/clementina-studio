# Shapes and animations

A **shape** is one static arrangement of sprites — a character, an object, a
pickup. A **sprite** is one OAM entry: a tile index, signed X and Y offsets
from the shape's origin, a palette bank, and horizontal and vertical flips.
So a shape is an ordered list of sprites, which is exactly what gets written
to OAM.

A shape draws from exactly one tileset, because Clementina has a single sprite
CHR bank (`SPRBANK`) and an OAM entry carries no bank field. Everything on
screen at once comes from the same tileset.

List order is OAM order, and a later sprite draws on top — the renderer scans
from 0 to `OAM_LAST_INDEX` and lets later entries overwrite earlier ones, the
opposite of the NES convention. There is no separate sprite id: a sprite's
position in the list is its offset from whatever OAM index the shape is loaded
at. Bring-to-front moves a sprite to the end of the list.

Color 0 is transparent for sprites. A sprite's palette bank defaults to the
bank its tile was drawn against in the tileset and can be changed per sprite,
which is how one tileset yields a red enemy and a blue one. OAM carries X as
10-bit signed (-512 to 511) and Y as 9-bit signed (-256 to 255), with the high
bits in the `ext` byte.

## Animations

An **animation** is a sequence of frames, each naming a shape, a duration of
1-255 ticks at 60 Hz, and an optional X and Y offset applied to the whole
shape.

It *references* shapes rather than copying them, so editing a shape updates
every frame showing it; duplicate a shape when you want one to diverge. The
per-frame offset exists so that a body bobbing one pixel does not need a
second shape.

This is why a shape needs no per-frame ordering. A limb that passes in front
of a torso partway through a walk is two shapes built from the same tiles in a
different order — and since a game rewrites the OAM records every frame
anyway, two shapes that differ in order cost no more than two that differ in
position.

Every shape in one animation must draw from the same tileset: the frames play
in sequence out of the one sprite CHR bank. The editor only offers shapes on
the animation's tileset.

Sprite-versus-background priority (`attr` bit 4) is not edited here. It
belongs to the future scene editor, along with which shapes share a CHR bank
and which shape loads at which OAM base. See [model.md](model.md).

## Editors

**Shapes.** Create a shape, pick its tileset, then select tiles from the tile
map and place them around the origin. Drag to move, arrows nudge by a pixel,
and bring-to-front and send-to-back reorder the list. The tileset is locked
once a shape holds sprites, since changing it would repoint every tile index
at different graphics.

**Animations.** Append shapes as frames, set each frame's duration and offset,
and press Play. The preview is 4× with a central origin; large offsets may
extend outside the preview viewport. Studio's preview loops; a game chooses
for itself.

Shape and animation edits share a 50-step undo history, separate from tileset
and palette edits.

## Export

There is none yet. The build step that will write shape and animation data
with assembly symbols comes after maps, scenes and music, so that it lays out
a whole project at once. See [model.md](model.md).
