// The studio's frame: the config picker, project commands, the application
// menu and view switching. The editors attach to it.
import { $, editingText } from './dom.js';
import { ProjectHistory } from './history.js';
import {
  newProject,
  redrawAll,
  renderPaletteLibrary,
  resetBuilderFolder,
  restoreStudioProject,
  setBuilderFolder,
  showView,
} from './lifecycle.js';
import {
  activeConfigId,
  clearProject,
  currentView,
  loadDefaultPalettes,
  loadProject,
  paletteConfigs,
  setActiveConfigId,
  setCurrentView,
  setFrameIndex,
  setPlaying,
  studioProject,
} from './state.js';
import {
  dirty,
  markDirty,
  setDirty,
  setDirtyLabel,
  setNameFromFile,
  setProjectFile,
  setStatus,
} from './status.js';
import { StudioShell } from './studio-shell.js';

// The editors redraw themselves; the palette library has no hook of its own.
redrawAll.after(() => {
  renderConfigPicker();
  renderPaletteLibrary();
});

// ===== active config picker =====
// Switching config is a constant part of drawing, not a setting, so it lives in
// the header where every view can reach it.
export function renderConfigPicker() {
  const picker = $('configPicker');
  picker.replaceChildren(
    ...paletteConfigs.map((c) => new Option(c.name, c.id, false, c.id === activeConfigId)),
  );
  picker.disabled = paletteConfigs.length < 2;
  $('configPickerWrap').title =
    paletteConfigs.length < 2
      ? 'Add more configs in Palettes to switch between them'
      : 'Preview only — it does not change what a project exports';
}
$('configPicker').onchange = () => {
  setActiveConfigId($('configPicker').value);
  redrawAll();
};

// ===== project =====
newProject.after(() => {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  window.studio?.newProject();
  resetBuilderFolder();
  clearProject();
  ProjectHistory.clear();
  loadDefaultPalettes();
  $('nameInput').value = 'tiles';
  setProjectFile(null);
  setDirty(false);
  setDirtyLabel();
  redrawAll();
  setStatus('New project — create your first tileset.');
});
restoreStudioProject.after((p, name = 'Recovered project') => {
  resetBuilderFolder();
  loadProject(p);
  ProjectHistory.clear();
  setNameFromFile(name);
  setDirty(false);
  setDirtyLabel();
  redrawAll();
});
export async function studioAction(action) {
  try {
    await action();
  } catch (e) {
    alert(e.message);
    setStatus(e.message);
  }
}
$('newBtn').onclick = () => newProject();
$('nativeOpen').onclick = () =>
  studioAction(async () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    const file = await window.studio.open();
    if (!file) return;
    restoreStudioProject(file.project, file.name);
    await window.studio.opened(file.path, file.kind);
    if (file.kind === 'portable') setBuilderFolder(file.root);
    setStatus('Opened ' + file.name);
  });
export async function nativeSave(saveAs) {
  const snapshot = studioProject();
  const name = await window.studio.save(snapshot, saveAs);
  if (name) {
    if (saveAs) resetBuilderFolder();
    setProjectFile(name);
    setDirty(JSON.stringify(snapshot) !== JSON.stringify(studioProject()));
    setDirtyLabel();
    setStatus('Saved ' + name);
  }
}
$('nativeSave').onclick = () => studioAction(() => nativeSave(false));
$('nativeSaveAs').onclick = () => studioAction(() => nativeSave(true));
if (!window.studio)
  for (const id of ['nativeOpen', 'nativeSave', 'nativeSaveAs']) $(id).disabled = true;
// The application menu owns the project and zoom shortcuts, so they work even
// while a field has focus, and forwards them here. Zoom goes to whichever
// canvas the current view shows; views without one ignore it.
const projectCommands = {
  newProject: 'newBtn',
  open: 'nativeOpen',
  save: 'nativeSave',
  saveAs: 'nativeSaveAs',
};
function runCommand(command) {
  if (projectCommands[command]) {
    $(projectCommands[command]).click();
    return;
  }
  if (command === 'shortcuts') {
    StudioShell.showShortcuts();
    return;
  }
  if (command.startsWith('view:')) {
    if (!document.querySelector('dialog[open]')) showView(command.slice(5));
    return;
  }
  if (command === 'undo' || command === 'redo') {
    if (editingText()) document.execCommand(command);
    else if (!document.querySelector('dialog[open]')) ProjectHistory[command]();
    return;
  }
  if (!document.querySelector('dialog[open]')) StudioShell.canvasCommand(currentView, command);
}
window.studio?.onCommand?.(runCommand);
// The main process asks for the project to keep a recovery snapshot and to
// guard closing, restores a recovered project and reports recovery errors.
const pageRequests = {
  snapshot: () => ({ dirty, project: studioProject() }),
  projectJson: () => JSON.stringify(studioProject()),
  recover: (project) => {
    restoreStudioProject(project);
    markDirty();
  },
  status: (text) => setStatus(text),
};
window.studio?.onRequest?.((name, arg) => pageRequests[name](arg));

// ===== views =====
const descriptions = {
  builder: [
    'Builder',
    'Choose asset files and memory slots, build a portable SD card, and run your assembly program.',
  ],
  palettes: [
    'Palettes',
    'Palettes hold eight colors. A bank config places sixteen of them in palette RAM; a game loads one config at a time.',
  ],
  tiles: [
    'Tilesets',
    'Each tileset fills one CHR bank. Draw tiles and record which palette bank each was drawn against.',
  ],
  overlays: [
    'Overlays',
    'Paint the fixed 40 × 25 text/HUD layer. Placeholders mark regions the build step can fill at runtime; whatever you paint there is the default content.',
  ],
  backgrounds: [
    'Backgrounds',
    'Paint a background from two tilesets. A cell reads the primary or alternate tileset, chosen by its CHR_ALT bit.',
  ],
  shapes: [
    'Shapes',
    'One arrangement of sprites from a single tileset. Later sprites draw on top.',
  ],
  animations: [
    'Animations',
    'Sequence shapes and set their timing. Editing a shape updates every frame showing it.',
  ],
  sounds: [
    'Sounds',
    "A sound effect is one voice's registers, frame by frame at 60 Hz: pitch, volume, pulse width, waveform and gate.",
  ],
  music: [
    'Music',
    "A song plays up to four voices on MIA's background sequencer. Voices without notes stay free for sound effects.",
  ],
};
showView.after((view) => {
  StudioShell.selectView(view);
  setCurrentView(view);
  setPlaying(false);
  setFrameIndex(0);
  window.scrollTo(0, 0);
  $('viewTitle').textContent = descriptions[view][0];
  $('viewHelp').textContent = descriptions[view][1];
  renderConfigPicker();
  // A control the switch hid would keep focus until the next frame and
  // swallow keys meant for the new view.
  const focused = /** @type {HTMLElement} */ (document.activeElement);
  if (focused && focused !== document.body && !focused.checkVisibility()) focused.blur();
});
document
  .querySelectorAll('[data-view]')
  .forEach((button) => (button.onclick = () => showView(button.dataset.view)));

// ===== boot =====
// The editors attach to the shell and add to showView, so boot after them.
export function bootStudio() {
  newProject();
  showView('tiles');
}
