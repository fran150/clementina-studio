// Shared presentation and interaction primitives. Asset data stays in the editors.
//
// Each editor reaches them through StudioShell; they live in shell/: icons,
// layout pieces (rails, panels, status, tabs), tooltips, lists and asset
// libraries, menus, canvas zoom, the palette bank dock, the clipboard and the
// shortcut sheet.
// Setting up the page's shared parts runs here, in order, once.
import { bankDock, hoverBankDock, syncBankDock, TRANSPARENT_ZERO } from './shell/bank-dock.js';
import { clipboard, editActions, installEditCommands } from './shell/clipboard.js';
import { defineEditor } from './shell/editor.js';
import { historyButtons } from './shell/history-buttons.js';
import { iconButton, icons, setIcon } from './shell/icons.js';
import { viewKeys } from './shell/keys.js';
import {
  bindPanel,
  emptyEditor,
  mountNavigation,
  railLayout,
  selectView,
  toolRail,
  viewStatus,
} from './shell/layout.js';
import { assetLibrary } from './shell/library.js';
import { renderList, renderOptions, startRename } from './shell/lists.js';
import { contextMenu, editMenu, installMenuDismiss } from './shell/menu.js';
import { helpButton, installShortcuts, showShortcuts } from './shell/shortcuts.js';
import { installTooltips } from './shell/tooltip.js';
import { canvasCommand, canvasZoom, fitZoom, zoomScrolled } from './shell/zoom.js';

mountNavigation();
installTooltips();
installMenuDismiss();
installEditCommands();
installShortcuts();

export const StudioShell = Object.freeze({
  icons,
  clipboard,
  editActions,
  viewStatus,
  contextMenu,
  editMenu,
  defineEditor,
  viewKeys,
  showShortcuts,
  helpButton,
  bankDock,
  syncBankDock,
  hoverBankDock,
  TRANSPARENT_ZERO,
  iconButton,
  historyButtons,
  setIcon,
  toolRail,
  railLayout,
  bindPanel,
  emptyEditor,
  selectView,
  assetLibrary,
  renderList,
  renderOptions,
  startRename,
  fitZoom,
  zoomScrolled,
  canvasZoom,
  canvasCommand,
});
