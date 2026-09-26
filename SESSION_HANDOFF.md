# Clementina Studio session handoff — 2026-09-25

## Scope and standing rules

Studio UI development in `/Users/fran150/development/clementina/clementina-studio`.
SDK work is separate (`../clementina-sdk/SESSION_HANDOFF.md`); you don't need it
for UI work.

- **Do not commit or push unless explicitly asked.** When asked to commit on
  `main`, branch first. End commit messages with the co-author line the harness
  gives.
- Preserve modified and untracked files; never reset or clean.
- Don't start a new editor or SDK phase unprompted; act on the user's feedback.
- The user treats cross-editor inconsistency as a bug. Before changing one
  editor, read a sibling editor's current source and reuse the shared shell
  (`docs/editor-shell.md`) rather than re-inventing a control.

## Repository state

On `main`: `20bd226` holds the app-wide consistency pass and `280d4cb` the
empty-state pass. Uncommitted until the user asks, two pieces of work:

- **Audio (2026-09-25):** the Sounds and Music editors, the MIA audio engine
  and song compiler in `packages/assets/audio.ts`, the firmware cross-check in
  `tests/firmware/`, and `docs/audio.md`. See "Audio" below.

- **Older, from before the audio work:** changes that were already in the
  working tree when it started, among them per-frame flips in Animations
  (`flipX`/`flipY` on frames, Shift+H/V). They touch some of the same files
  (`studio-shell.js`/`.css`, `docs/model.md`, `docs/editor-shell.md`,
  `packages/assets/index.ts`, `tests/desktop-conventions.cjs`); `git diff`
  shows both together.

The empty-state and stage pass, the shared Preview panel and the named Edit ▸
Undo/Redo steps are committed in `280d4cb`.

Run `git status` and `git log -3` before editing.

## What the editors share

Tabs, in order: Palettes, Tilesets, Shapes, Animations, Backgrounds, Overlays,
then past a rule Sounds and Music (Ctrl/Cmd+1–8). Below 1320 pixels the tab
bar compacts so all of it fits one row at 1024.

- **Layout:** each workspace is a `.studioEditor` grid with columns left rail,
  left dock, main, right dock, right rail.
  - Left docks hold what you pick from; right docks hold the selection's
    properties.
  - Rails run panel toggles, then tools, with copy, paste, undo and redo at
    the bottom.
- **Canvas navigation:** the wheel pans; pinch or Ctrl/Cmd+wheel zooms along a
  shared ladder (`canvasZoom`).
  - Fit is Ctrl/Cmd+0 and Actual Size is Ctrl/Cmd+Alt+0.
  - A pinch follows the fingers. Chromium reports every pinch event as a
    wheel notch, so `wheelDelta` can't tell pinch from mouse.
- **Selection, clipboard and flips:** one clipboard for the whole app;
  `cell-grid.js` is the Select tool for background and overlay cells.
  Shift+H/V flip.
- **Right-click:** with a painting tool it erases; with any other tool it opens
  the edit menu.
- **Undo:** one project-wide history (`history.js`) with labelled steps.
- **Chrome:** one status bar, one global Config picker beside the tabs, File
  actions in the tab bar, and the shortcut sheet on Ctrl/Cmd+/.

## Architecture

- **Renderer:** Electron with plain classic scripts sharing globals. Keep the
  script order in `apps/desktop/editor.html`:
  - `studio-shell.js`, `cell-grid.js`, `history.js`
  - `image-import-ui.js`, `bank-editor.js` (Tilesets), `overlay-editor.js`,
    `background-editor.js`, `palette-library.js`, `animation-editor.js`,
    `sprite-composer.js` (Shapes)
  - `audio-shared.js`, `sound-editor.js`, `music-editor.js`
  - then a module script imports `dist/packages/assets/audio.js` as
    `window.MiaAudio`. It runs after `bootStudio()`, before the page's load
    event; the audio editors read it lazily and re-render on `miaaudioready`.
- **Main process:** `apps/desktop/main.ts` owns the menus. Menu items reach the
  page as `studio:command` and go through `runCommand` in `editor.html`.
  `preload.cts` exposes `window.studio`.
- **Files:** projects are `.cstudio` only (legacy `.mtb` open was dropped).
- **SDK:** linked with `file:../clementina-sdk/packages/...`. Build the SDK
  before Studio after a fresh install.
- **Docs:** read `README.md`, `docs/model.md`, `docs/editor-shell.md` (the
  shared primitives) and `docs/animations.md`.

## Hardware facts in play

Check the canonical sources again before any hardware-dependent change.

- All sprites use one globally selected CHR bank at a time. A shape is several
  8×8 sprites, and an animation's frames each reference one shape from the
  same tileset.
- A background draws its color 0 opaque, in the cell's bank; an overlay skips
  color 0. Source: `renderBackground` in `clementina-video-client`
  `internal/render/renderer.go`.

## Audio

`docs/audio.md` is the reference. In short:

- Two editors, one engine. A song runs on MIA's background sequencer (notes on
  a grid, zero 6502 cost); a sound effect is per-60 Hz-frame register writes
  a driver makes on a voice it takes with VTAKE. Instruments belong to songs.
- `MiaEngine` is `audio.c` bit for bit, including the live-write queue (16
  writes per sample) and VTAKE/VGIVE catch-up. `npm run test:firmware`
  compiles `../clementina-mia/src/mia/audio/audio.c` against stub Pico headers
  and compares every sample of five scenarios; `tests/audio.test.mjs` holds
  the engine to the recorded firmware hashes.
- Firmware facts the compiler relies on: a NOTE only restarts the envelope on
  the gate's rising edge (so a note that should attack gets a one-sample REST
  first; legato notes skip it), and the sequencer holds an event for its
  duration field plus one sample (so durations are written as samples − 1).
- Three findings reported to the user, not acted on (other repos): the
  sequencer doc's `dur` vs the ISR's `dur + 1`; ROM TRACK never gates off
  between notes; no SET_FREQ opcode for smooth sequenced pitch moves.
- Not built: exporting tracks and sounds, the SFX driver routine, and voice
  allocation between a scene's song and its sounds — the build step's job.

## Tests

```sh
npm test                                   # 57 model tests
npm run test:firmware                      # engine vs clementina-mia's audio.c
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SECURITY_WARNINGS=1 npm run test:ui
```

`test:ui` chains every Electron suite: workflow, shell, animation, background,
overlay, navigation, editing, conventions, audio, smoke. Each also runs alone as
`npm run test:desktop:<name>` (`test:desktop` is the smoke test).

- This environment sets `ELECTRON_RUN_AS_NODE`, so unset it for Electron. The
  warning flag only keeps Electron's development notice out of console
  assertions.
- The suites drive a hidden window:
  - input goes through `sendInputEvent`;
  - pinches go through CDP `Input.synthesizePinchGesture`;
  - menu commands go through `webContents.send('studio:command', …)`.
- A hidden window gets no focus events until `webContents.focus()` is called.
- `desktop-conventions.cjs` guards the cross-editor rules: tab order, empty
  states, stage, Preview panel, right-click, flips, docks, undo labels in the
  buttons and the menu.

All suites passed on 2026-09-25, after the audio work.

## Possible next work

Only at the user's direction. The usability list from the consistency audit is
finished. Earlier ideas, not started:

- scenes, then code generation (which now also covers audio export);
- onion skin in Animations.
