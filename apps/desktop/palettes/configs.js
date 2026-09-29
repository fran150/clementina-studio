// Bank configs: which palette each of the sixteen banks holds. Editing a
// config edits what every other editor previews, so the whole app redraws
// rather than just this panel.
import { graphicsEdit } from '../bank-editor.js';
import { $ } from '../dom.js';
import { redrawAll, renderAnimations, renderBankEditor } from '../lifecycle.js';
import {
  activeConfig,
  activeConfigId,
  bankColors,
  createConfig,
  css565,
  paletteConfigs,
  paletteLibrary,
  setActiveConfigId,
} from '../state.js';
import { setStatus } from '../status.js';
import { renderConfigPicker } from '../studio-core.js';
import { StudioShell } from '../studio-shell.js';
import { pl } from './model.js';

export function configEdit(...args) {
  graphicsEdit(...args);
  renderConfigPicker();
  renderBankEditor();
  renderAnimations();
}
// Electron's window.prompt() throws rather than showing a dialog, so config
// renaming uses the same inline-input pattern as every other renameable list.
export function renameConfig(i, name) {
  if (!name) return false;
  if (paletteConfigs.some((c, j) => j !== i && c.name.toLowerCase() === name.toLowerCase())) {
    setStatus('Use a unique config name.');
    return false;
  }
  configEdit('Rename a config', () => (paletteConfigs[i].name = name));
  return true;
}
/** Draws the config list and the open config's sixteen banks. */
export function renderConfigs() {
  StudioShell.renderList($('palConfigList'), paletteConfigs, {
    selected: (c) => c.id === activeConfigId,
    choose: (c) => {
      setActiveConfigId(c.id);
      redrawAll();
      pl.render();
    },
    rename: renameConfig,
    render: pl.render,
    maxLength: 48,
    duplicate: (c) => {
      setActiveConfigId(c.id);
      $('palConfigCopy').click();
    },
    remove: (c) => {
      setActiveConfigId(c.id);
      $('palConfigDelete').click();
    },
    content: (row, config) => {
      let name = row.firstElementChild;
      if (!name) {
        name = document.createElement('span');
        row.replaceChildren(name);
      }
      name.textContent = config.name;
    },
  });
  $('palConfigDelete').disabled = paletteConfigs.length < 2;
  const config = activeConfig();
  $('palBankGrid').replaceChildren(
    ...Array.from({ length: 16 }, (_, bank) => {
      const row = document.createElement('div');
      row.className = 'palBankRow';
      const label = document.createElement('span');
      label.textContent = String(bank).padStart(2, '0');
      const chips = document.createElement('span');
      chips.className = 'rowChips';
      for (const color of bankColors(bank)) {
        const chip = document.createElement('i');
        chip.style.background = css565(color);
        chips.append(chip);
      }
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Palette in bank ' + bank);
      // Two banks may hold one palette: banks are an authored layout, not a set.
      select.replaceChildren(
        new Option('— empty —', '', false, !config?.banks[bank]),
        ...paletteLibrary.map((p) => new Option(p.name, p.id, false, p.id === config?.banks[bank])),
      );
      // configEdit alone does not touch this panel; without the extra render() the
      // chips beside this very select would keep showing the bank's old colors.
      select.onchange = () => {
        configEdit(`Change bank ${bank}`, () => (config.banks[bank] = select.value || null));
        pl.render();
      };
      row.append(label, chips, select);
      return row;
    }),
  );
}

/** Adds the config list's New, Duplicate and Delete buttons. */
export function configActions() {
  const iconButton = (id, label, icon) => StudioShell.iconButton(id, label, icon);
  for (const [id, label, path] of [
    ['palConfigNew', 'New config', 'newItem'],
    ['palConfigCopy', 'Duplicate config', 'duplicate'],
    ['palConfigDelete', 'Delete config', 'delete'],
  ]) {
    $('palConfigListActions').append(iconButton(id, label, path));
  }
  $('palConfigNew').onclick = () => {
    configEdit('New config', () => {
      setActiveConfigId(createConfig().id);
    });
    pl.render();
    setStatus('Added a bank config. Fill its banks, then switch to it while drawing.');
  };
  $('palConfigCopy').onclick = () => {
    const from = activeConfig();
    if (!from) return;
    configEdit('Duplicate ' + from.name, () => {
      setActiveConfigId(createConfig(undefined, from.banks).id);
    });
    pl.render();
    setStatus('Duplicated ' + from.name + '.');
  };
  $('palConfigDelete').onclick = () => {
    const target = activeConfig();
    if (!target || paletteConfigs.length < 2) {
      setStatus('A project keeps at least one bank config.');
      return;
    }
    setStatus(`Deleted ${target.name}. Ctrl/Cmd+Z brings it back.`);
    configEdit('Delete ' + target.name, () => {
      paletteConfigs.splice(paletteConfigs.indexOf(target), 1);
      setActiveConfigId(paletteConfigs[0].id);
    });
    pl.render();
    setStatus('Deleted ' + target.name + '.');
  };
}
