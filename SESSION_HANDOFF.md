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

Branch `editor-ux-consistency`, forked from `main` (which is unchanged, nothing
pushed). `20bd226` holds the app-wide consistency pass. On top of it, uncommitted
until the user asks:

- The empty-state and stage pass:
  - Every editor's empty state is the same centered message, filling the main
    area on the same dot-grid stage.
  - The editor's top bar and its asset docks (map, tile picker, properties)
    step aside while it shows.
  - Every canvas sits on `.studioStage` with the `.studioArt` edge.
- One Preview panel (`.canvasPreview`) with the same top-bar toggle in Tilesets
  and Shapes, on by default.
- Edit ▸ Undo and Redo name the step ("Undo Paint"), via the `menu:history` IPC.

Run `git status` and `git log -3` before editing.

## What the editors share

Tabs, in order: Palettes, Tilesets, Shapes, Animations, Backgrounds, Overlays
(Ctrl/Cmd+1–6).

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

## Tests

```sh
npm test                                   # 43 model tests
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SECURITY_WARNINGS=1 npm run test:ui
```

`test:ui` chains every Electron suite: workflow, shell, animation, background,
overlay, navigation, editing, conventions, smoke. Each also runs alone as
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

All suites and `git diff --check` passed on 2026-09-25.

## Possible next work

Only at the user's direction. The usability list from the consistency audit is
finished. Earlier ideas, not started:

- scenes, music, then code generation, in that order;
- onion skin in Animations.
