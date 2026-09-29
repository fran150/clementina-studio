// Builder edits the manifest settings. Planning, writing, building and running
// go through main-process IPC to the SDK; the renderer never assembles assets.
//
// This file holds rendering and wiring; its parts live in builder/: the
// shared model, the asset list and memory map, the properties, slot edits,
// the rails, and the SDK calls.
import { buildButtons, refresh, useFolder } from './builder/build.js';
import { bu, edit } from './builder/model.js';
import { renderLists, renderMap } from './builder/panels.js';
import { renderProps } from './builder/props.js';
import { builderRails } from './builder/rails.js';
import { remove } from './builder/slots.js';
import { $ } from './dom.js';
import { resetBuilderFolder, setBuilderFolder } from './lifecycle.js';
import { builderSettings, studioProject } from './state.js';
import { StudioShell } from './studio-shell.js';

const host = $('builderEditor');
host.querySelector('.buTop .studioBarEnd').append(StudioShell.helpButton());
builderRails();
const workspace = StudioShell.defineEditor({
  view: 'builder',
  host,
  render,
  status: $('buStatus'),
});

// ===== rendering =====
/** Redraws the builder: the panels, then a replan if the project changed. */
function render() {
  if (!workspace.shown()) return;
  renderLists();
  renderMap();
  renderProps();
  const input = JSON.stringify(studioProject());
  if (input !== bu.lastInput && window.studio?.builderPlan) {
    bu.lastInput = input;
    clearTimeout(bu.timer);
    bu.timer = setTimeout(() => refresh(), 80);
  }
  for (const id of ['buSave', 'buBuild', 'buRun']) $(id).disabled = bu.busy || !bu.root;
}
bu.render = render;

// ===== wiring =====
$('buAssetFolder').onchange = () =>
  edit('Change asset folder', () => (builderSettings.folder = $('buAssetFolder').value));
$('buChecks').onchange = () =>
  edit('Change runtime checks', () => (builderSettings.checks = $('buChecks').checked));
buildButtons();
StudioShell.viewKeys('builder', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && remove()) e.preventDefault();
});
document.addEventListener('studiohistory', () => {
  bu.lastInput = '';
});
export { render as renderBuilder };
resetBuilderFolder.after(() => {
  bu.root = null;
  bu.selection = null;
  bu.plan = null;
  bu.catalog = [];
  bu.lastInput = '';
  bu.request++;
  $('buFolderPath').textContent = 'Choose a portable project folder to save or build.';
});
setBuilderFolder.after(useFolder);
render();
