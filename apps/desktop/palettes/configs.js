// Bank configs: which palette each of the sixteen banks holds. Editing a
// config edits what every other editor previews, so the whole app redraws
// rather than just this panel.
import { graphicsEdit } from '../bank-editor.js';
import { $ } from '../dom.js';
import { nameTaken } from '../domain/names.js';
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
  if (nameTaken(paletteConfigs, name, i)) {
    setStatus('Use a unique config name.');
    return false;
  }
  configEdit('Rename a config', () => (paletteConfigs[i].name = name));
  return true;
}
/** The config list, made by configActions. */
let configList;
/** Draws the config list and the open config's sixteen banks. */
export function renderConfigs() {
  configList.render();

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

/**
 * Wires the config list's New, Duplicate and Delete buttons. Configs have no
 * count limit, and the last one stays. The open config is the active one.
 */
export function configActions() {
  configList = StudioShell.assetLibrary({
    noun: 'config',
    plural: 'configs',
    limited: false,
    list: $('palConfigList'),
    items: () => paletteConfigs,
    index: () => paletteConfigs.findIndex((c) => c.id === activeConfigId),
    choose: (i) => {
      setActiveConfigId(paletteConfigs[i].id);
      redrawAll();
      pl.render();
    },
    select: (i) => setActiveConfigId(paletteConfigs[i].id),
    rename: renameConfig,
    render: () => pl.render(),
    content: (row, config) => {
      let name = row.firstElementChild;
      if (!name) {
        name = document.createElement('span');
        row.replaceChildren(name);
      }
      name.textContent = config.name;
    },
    buttons: {
      rail: $('palConfigListActions'),
      create: 'palConfigNew',
      duplicate: 'palConfigCopy',
      remove: 'palConfigDelete',
    },
    create: (label) => {
      configEdit(label, () => {
        setActiveConfigId(createConfig().id);
      });
      pl.render();
    },
    created: () => 'Added a bank config. Fill its banks, then switch to it while drawing.',
    copy: (from, label) => {
      configEdit(label, () => {
        setActiveConfigId(createConfig(undefined, from.banks).id);
      });
      pl.render();
    },
    copied: (from) => 'Duplicated ' + from.name + '.',
    removable: () =>
      paletteConfigs.length < 2 ? 'A project keeps at least one bank config.' : null,
    remove: (target, label) => {
      configEdit(label, () => {
        paletteConfigs.splice(paletteConfigs.indexOf(target), 1);
        setActiveConfigId(paletteConfigs[0].id);
      });
      pl.render();
    },
  });
}
