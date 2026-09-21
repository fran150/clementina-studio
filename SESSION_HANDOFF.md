# Clementina Studio session handoff — 2026-09-21

## Scope and user preferences

Continue **Studio UI development** in `/Users/fran150/development/clementina/clementina-studio`.
This is independent of SDK roadmap work; the SDK has its own handoff at
`../clementina-sdk/SESSION_HANDOFF.md`. You do not need that handoff to resume UI work.

**Do not commit or push unless explicitly asked.** Preserve all existing modified
and untracked files. The user likes the palette, tileset and shape editors; preserve
their workflows. The latest animation improvements are implemented and tested,
awaiting user review. Do not automatically begin another editor or SDK phase.

## Repository state

The previous pushed Studio baseline is `f29e046`. Check `git log -1` and
`git status` for the current state before editing.
- `168db66`: initial SDK types/converters integration via local package links.
- `f29e046`: shared shell and initial extracted animation workspace.
These commits predate the user's instruction to stop committing.
The user subsequently requested a local commit of this handoff and the animation
update below. They did not authorize pushing. The standing rule still applies:
do not create further commits or push unless explicitly asked.

## Animation update included in this commit

Implementation and documentation files:
- `apps/desktop/animation-editor.js`
- `tests/desktop-smoke.cjs`
- `package.json`
- `README.md`

Added regression test:
- `tests/desktop-animation.cjs`

Implemented animation editor:
- Native **320×200 backing canvas**, scaled to fit available workspace, preserving
  aspect ratio and CSS pixelated rendering. Fit scaling may be fractional.
- Left animation/shape libraries dock in grid columns; opening them resizes the
  workspace instead of overlaying the preview, inspector or timeline.
- Thumbnail timeline supports selecting frames and drag reordering; keyboard
  Enter/Space selects, arrows navigate, Alt+arrows reorder.
- Previous/next and play/pause. Playback uses 60 Hz frame ticks; pausing selects the
  displayed frame. Playback starts from the selected frame.
- Selected-frame row edits shape reference, ticks, dx/dy; duplicate/remove and
  move-earlier/later controls. Last frame cannot be removed.
- Ctrl/Cmd-click or Shift-click selects multiple source shapes. Append adds them
  as successive frames in library order; only the animation's tileset is offered.
- Canvas dragging adjusts the selected frame's offset, leaving source shapes
  unchanged. One drag creates one undo checkpoint.
- Existing animation file/model format is unchanged. Each frame references ONE
  shape; this is not a multi-actor scene/timeline implementation.
- Bulk append and duplicate enforce the existing frame-count limit.

The final response told the user this update was finished and verified. Next step
is their review/feedback, not an assumed new feature. Potential future work discussed:
background/scenes, music, then code generation. Onion skin was mentioned as optional
but is not implemented. No scene/music editor or code generation was added.

## Hardware/model clarification already given to the user

Clementina has eight CHR banks but **one globally selected CHR bank for all sprites
at a time**. Different shapes can be sequenced in an animation if they share its
tileset. A shape comprises multiple 8×8 sprites. Simultaneous independent actors
belong to future scene composition; multiple shapes per frame would need a different
model. Do not silently change that model.

Sources checked: SDK `docs/compatibility.md`, `docs/architecture/video.md`,
`specs/video.json` (`sprites.singleGlobalChrBank`), `specs/assets.json`,
`specs/schema/animation.schema.json`, and ROM `BASIC_SPRBANK` implementation.
Always consult canonical docs/specs again before hardware-dependent work.
The audio sequencer/SD memory overlap remains unresolved. No runtime allocation
or hardware memory placement was implemented.

## Verification completed on 2026-09-21

All passed after the final animation edits:
- Studio `npm test`: **40 model tests**.
- `npm run test:desktop`: existing full Electron smoke test.
- `npm run test:desktop:shell`: shared shell interactions.
- `npm run test:desktop:animation`: batch shape append, same-tileset filtering,
  reorder and undo/redo, playback/pause, frame offsets, actual mouse dragging with
  pointer capture and a single undo step, drag/drop reorder, cross-asset validation,
  and docked-panel bounds at **1440 and 1024 pixels wide**.
- `git diff --check`.

Run from the Studio directory. This environment inherits ELECTRON_RUN_AS_NODE;
unset it for Electron UI tests:

```sh
npm test
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SECURITY_WARNINGS=1 npm run test:desktop
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SECURITY_WARNINGS=1 npm run test:desktop:shell
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SECURITY_WARNINGS=1 STUDIO_CAPTURE_DIR=/tmp npm run test:desktop:animation
```

The warning suppression only keeps Electron's development security notice out of
test-console assertions; application security settings were not altered.
The screenshot option writes `animation-1440.png` and `animation-1024.png` into the
specified directory. Both final screenshots were visually inspected: large canvas,
accessible frame controls, panels beside rather than covering the work area.
Temporary files may not survive; regenerate with the command above if needed.

The existing smoke test was updated to use the new thumbnail count and select frame
zero before checking its offset. In the earlier committed shell work, its 1bpp test
was corrected to sample planes before switching back to 3bpp, and obsolete animation
control IDs were updated. These were test corrections, not hardware changes.

## Architecture and dependencies

Read Studio `README.md`, `docs/model.md`, and `docs/editor-shell.md`.
Shared chrome is in `apps/desktop/studio-shell.js` and `studio-shell.css`.
The renderer uses plain JS scripts and globals, wrapping `showView`, `redrawAll`,
and `renderAnimations`. Preserve script order in `editor.html`: shell, image import,
bank, palettes, animation, shape composer, then boot.

SDK dependencies are local `file:../clementina-sdk/packages/...` links. Build the SDK
before Studio after a fresh checkout/install. SDK main was `a71acdc` when verified.
Studio imports SDK models and conversion helpers but retains its legacy validators
and `.cstudio` persistence. Portable project open/save is not wired into the UI.
Do not replace validators wholesale without compatibility and migration coverage.

The SDK is the authoritative developer contract. Read its `AGENTS.md`,
`docs/compatibility.md`, relevant architecture docs and specs before hardware work.
Portable assets must match SDK schemas, keep session state separate, and validate
cross-asset references. New scene/music formats require coordination with SDK work;
do not silently introduce incompatible models in either session.

## Resume

Inspect the Studio diff, then act on the user's animation-editor feedback. Potential
later work is background/scenes, music, and code generation, in that order, subject
to user direction. Work is saved locally. Preserve it and do not reset, clean, make further commits,
or push without explicit instructions.
If this session's workspace only permits SDK writes, use the available approval
mechanism for Studio rather than asking the user to copy files.
