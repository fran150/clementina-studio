# Clementina Studio session handoff — 2026-09-26

## 2026-09-26: SDK validator migration

Studio's project and graphical asset validators now delegate to
`@clementina/project`; audio validators use the browser-safe
`@clementina/assets/audio` module. Studio v2 session files keep their legacy
identity and optional-field behavior. The SDK provides a separate normalized
check path; portable export remains stricter. SDK `npm test` (105/105), Studio
`npm test` (64/64), and the audio and Builder Electron UI checks pass. All work
remains uncommitted.

## 2026-09-26: Portable project opening and saving

File > Open accepts `clementina.yaml` as well as `.cstudio`. Studio loads the
portable assets into all editors, and File > Save writes them back to the same
folder through the SDK. Builder's Project folder action also opens an existing
assembly project's assets. Existing manifest paths, program/build settings,
source files, and animation IDs are preserved. New and duplicated animations get
stable IDs; the confirmation remains for assets absent from Studio on save.

Verified: SDK 101/101, Studio 64/64, all 11 Electron UI suites, and a focused
Electron open/edit/save round trip. No commit or push.

## 2026-09-26: Builder tab and SDK audio

Uncommitted, and not to be committed until the user asks.

- The Sounds and Music editors use the SDK's song and sound compiler.
  - `packages/assets/audio.ts` re-exports compileSong, noteFrequency,
    soundWrites and stepSample from `@clementina/assets/audio`.
  - `apps/desktop/editor.html` has an import map for that module, because
    the renderer loads modules without Node resolution.
  - That SDK module must keep having no runtime imports.
- The Builder tab is built (design: `../clementina-sdk/docs/gamedev/builder.md`;
  SDK state: `../clementina-sdk/SESSION_HANDOFF.md`).
  - `apps/desktop/builder-editor.js`: the workspace. Left dock: assets by
    type with include toggles and default slots. Main: built-in slots, MIA
    RAM slots and the 31 CPU banks, with drag-to-slot. Right dock: slot or
    asset properties, build settings, emulator tool paths. Rail: Select,
    New slot, copy, paste, undo, redo; Delete slot on the right rail.
  - `apps/desktop/builder.ts` (main process): converts the Studio project
    with fromStudioProjectV2, writes an SDK project folder (starter
    `src/main.s` and `link.cfg` only into an empty folder), plans with
    planAssetBuild and builds with buildProject. `main.ts` adds the
    `builder:*` IPC handlers, runs `clementina-automation` on the build's
    `sdRoot` and renders frames with `clementina-render`.
  - A save writes only the assets Studio holds. When the folder's
    `clementina.yaml` lists others, Save, Build and Run first ask in a
    native dialog (Cancel by default) naming what would be removed; the
    files stay on disk. Studio now opens these assets through File > Open or
    Builder's Project folder action.
  - Settings live in the Studio project as `builder` (saved and in recovery
    snapshots, one undo part in `history.js`) and in `clementina.yaml`'s
    `build.assets` when saved or built.
  - Builder sits after a second tab rule (`navRule`, renamed from
    `navAudio`), with Ctrl/Cmd+9, a `?` button and a shortcut-sheet entry.
- Verified 2026-09-26: npm test 61/61, test:firmware all "same", and all 11
  test:ui suites (including `tests/desktop-builder.cjs`). Run in Emulator was
  checked outside the UI by replaying its steps with the real binaries: the
  game reached `$1800` and a frame rendered. The UI test covers Build only.
- Run Electron tests with `env -u ELECTRON_RUN_AS_NODE`. VS Code sets it,
  which makes Electron start as Node.
- The user hasn't seen the Builder tab yet. Expect feedback. In particular,
  the main area is a grid of slot cards rather than a map drawn to scale.

### Working context carried over from the previous agent (2026-09-26)

This lived in the previous agent's private memory. The user profile,
hardware sources and standing instructions are in the same section of
`../clementina-sdk/SESSION_HANDOFF.md`; read it too.

**Editor consistency is a hard requirement.**
- The user expects every workspace to look and behave alike, and like
  standard editors.
- Before writing UI for one editor (the Builder tab included), read at least
  one sibling editor's current source end to end: DOM structure, CSS classes
  and JS wiring. That code is the spec, not a written style guide. Pick the
  most recently touched one with `git log --oneline -- apps/desktop/`.
- Verify visually before calling UI work done. Layout regressions are easy
  to miss in a code read.

**Shared conventions** (the 2026-09-24/25 consistency pass, committed as
20bd226 and 280d4cb; Sounds and Music in ddf0032):
- **Layout.** Every workspace is a `.studioEditor` five-column grid built from
  the StudioShell primitives (`docs/editor-shell.md`).
  - The left dock is where you pick from; the right dock holds the
    selection's properties.
  - The rail comes from a shared icon registry and `railLayout`: panels, then
    tools, then copy/paste/undo/redo pinned at the bottom.
  - Don't reinvent rails, docks, zoom, selection, clipboard, menus or undo.
- **Selection and editing.**
  - Selection and copy/paste work in every editor. `cell-grid.js` is shared
    by Backgrounds and Overlays, and the cell selection belongs to the
    Select tool.
  - There is one project-wide undo history (`history.js`) with labeled
    steps. Edit ▸ Undo and Redo name the step.
  - No confirm() on undoable deletes.
- **Chrome.**
  - One status bar. File actions live in the tab bar, next to one global
    Config picker. Shared empty states sit on one centered `.studioStage`.
  - Asset docks (`bindPanel({asset:true})`) hide while an editor is empty.
  - Shortcuts: a shortcut sheet exists; Shift+H/V flip.
- **Mouse.**
  - Canvas navigation: the wheel pans; pinch or Ctrl+wheel zooms.
  - Chromium gives every pinch event wheelDelta ±120, so wheelDelta can't
    tell a mouse notch from a pinch.
  - Right-click erases with a painting tool and opens the edit menu
    otherwise.
- **Tabs.**
  - Order: Palettes, Tilesets, Shapes, Animations, Backgrounds, Overlays,
    a rule, Sounds, Music, a rule, Builder. Ctrl/Cmd+1–9 switch between
    them.
  - The tab bar compacts below 1320 px so it still fits one row at 1024.

**Audio editors.** There are two editors over one engine:
- Sounds edits per-60 Hz-frame register lanes: what a 6502 driver writes to
  a voice taken with VTAKE.
- Music is a four-voice piano roll compiled to MIA sequencer bytecode.
  Instruments belong to Music.

The rationale is in `docs/audio.md`. The user may not have reviewed these
editors yet, so expect feedback on the split, the lane and roll UI, or the
preset generators.


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
then past a rule Sounds and Music, then past another rule Builder
(Ctrl/Cmd+1–9). Below 1320 pixels the tab
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
  - `image-import-ui.js`, `tileset-editor.js` (Tilesets), `overlay-editor.js`,
    `background-editor.js`, `palette-library.js`, `animation-editor.js`,
    `shape-editor.js` (Shapes)
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
