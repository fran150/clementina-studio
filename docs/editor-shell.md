# Shared editor shell

The existing palette, tileset, shape and animation workspaces share presentation
primitives from `apps/desktop/studio-shell.js` and `studio-shell.css`. These files
load before editor scripts. Editor content, model mutation, undo and canvas geometry
stay in each editor. This extraction preserves their current arrangements.

- `StudioShell.selectView(view)` updates the shared chrome and accessible current
  navigation item. The existing `showView` calls it before editor rendering.
- `iconButton(id, label, svgPath, options)` creates a labelled button; `setIcon`
  decorates an existing control without replacing its click handler. Paths are
  trusted application SVG, never imported asset content. Size, viewBox and rounded
  strokes can match each editor's existing icon vocabulary.
- `toolRail(id, label)` creates the shared vertical rail used by shapes/animations.
  Palette and tileset rails retain their specialized dimensions and drawing tools.
- `bindPanel({panel, button, closeId, closeClass, group, closeGroups})` binds a
  drawer and its trigger. It sets `aria-controls` and `aria-expanded`, adds a close
  button, and supports Escape inside the panel with focus returning to the trigger.
  `closeGroups` explicitly names groups to close on opening, keeping every trigger
  synchronized. Palette panels remain independent; shape and animation libraries
  remain mutually exclusive. Tilesets retain their content-switching flyout.
- Project-action icon styling, tooltips, navigation/header sizing, and global status
  presentation belong to the shell. Status messages are announced politely.

Future scene and music editors should compose these primitives and own their
canvas/timeline/inspector content. Keep selection and panel visibility out of portable
asset files. A shared shell does not require identical editor-specific layouts.

Run `npm test`, `npm run test:desktop`, and `npm run test:desktop:shell`.
When launched from a host that sets `ELECTRON_RUN_AS_NODE`, unset that variable for
Electron tests. Development Electron security notices may be suppressed for the
smoke runner using `ELECTRON_DISABLE_SECURITY_WARNINGS=1`; this does not change app
security settings. The shell suite checks navigation, drawer state, keyboard/focus
behavior and project data preservation in the real renderer.
