// Shared presentation and interaction primitives. Asset data stays in the editors.
//
// Each editor reaches them through StudioShell; they live in shell/: icons,
// layout pieces (rails, panels, status, tabs), tooltips, lists and asset
// libraries, menus, canvas zoom, the palette bank dock, the clipboard and the
// shortcut sheet.
// Setting up the page's shared parts runs here, in order, once.
import { bankDock, hoverBankDock, syncBankDock, TRANSPARENT_ZERO } from './shell/bank-dock.js';
import { clipboard, editActions, installEditCommands } from './shell/clipboard.js';
import { iconButton, icons, setIcon } from './shell/icons.js';
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
import { contextMenu, installMenuDismiss } from './shell/menu.js';
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
  showShortcuts,
  helpButton,
  bankDock,
  syncBankDock,
  hoverBankDock,
  TRANSPARENT_ZERO,
  iconButton,
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
