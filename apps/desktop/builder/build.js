// Talking to the SDK in the main process: planning as the project changes,
// saving, building and running, the emulator's screen, and the project
// folder and tools the builder uses.
import { $ } from '../dom.js';
import { restoreStudioProject } from '../lifecycle.js';
import { builderSettings, studioProject } from '../state.js';
import { baseName, dirty, setStatus } from '../status.js';
import { studioAction } from '../studio-core.js';
import { bu } from './model.js';
import { renderLists, renderMap } from './panels.js';
import { renderProps } from './props.js';

/** Shows the plan's or build's errors and warnings, and the status line. */
export function diagnostics(items) {
  $('buDiagnostics').textContent = items.length
    ? items.map((d) => `${d.severity}: ${d.path ?? ''} ${d.message}`).join('\n')
    : 'No build errors or warnings.';
  $('buStatus').textContent = items.length
    ? `${items.filter((d) => d.severity === 'error').length} errors · ${items.filter((d) => d.severity === 'warning').length} warnings`
    : `${builderSettings.include.length} ${builderSettings.include.length === 1 ? 'asset' : 'assets'} included`;
}
/** Asks the SDK to plan the build, and redraws with the answer. */
export async function refresh() {
  const id = ++bu.request;
  try {
    const r = await window.studio.builderPlan(studioProject(), builderSettings, baseName());
    if (id !== bu.request) return;
    bu.catalog = r.catalog ?? [];
    bu.plan = r.ok ? r.value : null;
    diagnostics(r.diagnostics);
    renderLists();
    renderMap();
    renderProps();
  } catch (e) {
    if (id === bu.request) diagnostics([{ severity: 'error', message: e.message }]);
  }
}
/** Shows the running emulator's screen, a frame at a time. */
async function frames() {
  if (!bu.running || bu.framePending) return;
  bu.framePending = true;
  try {
    const image = await window.studio.builderFrame();
    if (image) {
      $('buScreen').src = image;
      $('buPreview').hidden = false;
    }
  } catch (e) {
    setStatus('Emulator is running. Screen preview: ' + e.message);
    bu.running = false;
  } finally {
    bu.framePending = false;
    if (bu.running) setTimeout(frames, 250);
  }
}
/** Saves, builds, runs or stops, and reports the result. */
export async function perform(action) {
  if (bu.busy) return;
  bu.busy = true;
  bu.render();
  setStatus(
    action === 'run'
      ? 'Building and starting emulator…'
      : action === 'build'
        ? 'Building…'
        : 'Saving…',
  );
  try {
    const r = await window.studio.builderAction(
      action,
      studioProject(),
      builderSettings,
      baseName(),
    );
    diagnostics(r.diagnostics ?? []);
    $('buReport').open = true;
    if (r.ok) {
      bu.moduleSizes = r.moduleSizes ?? bu.moduleSizes;
      setStatus(
        r.message ?? (action === 'stop' ? 'Emulator stopped.' : `Built SD card: ${r.sdRoot}`),
      );
      if (action === 'run') {
        bu.running = true;
        $('buStop').hidden = false;
        frames();
      }
      if (action === 'stop') {
        bu.running = false;
        $('buStop').hidden = true;
      }
    } else
      setStatus(
        r.message ?? `${action === 'save' ? 'Save' : 'Build'} failed. See the build report.`,
      );
  } catch (e) {
    diagnostics([{ severity: 'error', message: e.message }]);
    setStatus(e.message);
  } finally {
    bu.busy = false;
    bu.render();
  }
}
/** Makes `folder` the project folder builds go to. */
export function useFolder(folder) {
  bu.root = folder;
  bu.selection = null;
  bu.plan = null;
  bu.catalog = [];
  bu.lastInput = '';
  bu.request++;
  $('buFolderPath').textContent = folder;
  bu.render();
}

/** Wires the folder and tool pickers and the Save, Build, Run and Stop buttons. */
export function buildButtons() {
  $('buFolder').onclick = () =>
    studioAction(async () => {
      const result = await window.studio.builderFolder();
      if (!result) return;
      if (!result.fresh) {
        if (dirty && !confirm('Discard unsaved changes?')) return;
        restoreStudioProject(result.project, result.name);
        await window.studio.opened(result.root + '/clementina.yaml', 'portable');
        useFolder(result.root);
        setStatus('Opened ' + result.name);
      } else {
        await window.studio.builderFolderSelected(result.root);
        useFolder(result.root);
      }
    });
  for (const [id, kind] of [
    ['buEmulator', 'emulator'],
    ['buRenderer', 'renderer'],
  ])
    $(id).onclick = () =>
      studioAction(async () => {
        const path = await window.studio.builderTool(kind);
        if (path) {
          $(id).title = path;
          $(id).textContent = path.split('/').at(-1);
        }
      });
  for (const action of ['save', 'build', 'run', 'stop'])
    $('bu' + action[0].toUpperCase() + action.slice(1)).onclick = () => perform(action);
}
