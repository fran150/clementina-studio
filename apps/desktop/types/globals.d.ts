// What the renderer scripts share through window, for type-checking them.
// Each script's own top-level names are already visible to the others; these
// are the ones set on window at runtime or by the preload script.

/**
 * An element looked up by id or selector. The scripts know which kind each one
 * is, so this allows any common form, canvas or dialog member rather than
 * asking for a cast at every lookup.
 */
type StudioElement = HTMLElement &
  Omit<HTMLInputElement, 'type'> &
  Omit<HTMLSelectElement, 'type'> &
  Omit<HTMLButtonElement, 'type'> &
  HTMLCanvasElement &
  HTMLDetailsElement &
  HTMLDialogElement & { type: string };

interface Document {
  getElementById(elementId: string): StudioElement | null;
}
interface ParentNode {
  querySelector(selectors: string): StudioElement | null;
  querySelectorAll(selectors: string): NodeListOf<StudioElement>;
}
interface Element {
  closest(selectors: string): StudioElement | null;
}

/** The preload script's bridge to the main process. */
declare var studio: import('../preload.cjs').StudioApi;
/** The MIA audio engine and song compiler, set by editor.html's module script. */
declare var MiaAudio: typeof import('../../../packages/assets/audio.js');

// Set by the editor scripts. Typed loosely until the scripts become modules.
declare var StudioShell: any;
declare var StudioAudio: any;
declare var ProjectHistory: any;
declare var CellGrid: any;
declare var graphicsEdit: any;
declare var openTilesetImageImport: any;
declare var bootStudio: () => void;
declare var renderBankEditor: () => void;
declare var renderBackgrounds: () => void;
declare var renderOverlays: () => void;
declare var renderPaletteLibrary: () => void;
declare var renderAnimations: () => void;
declare var renderSounds: () => void;
declare var renderMusic: () => void;
declare var renderBuilder: () => void;
declare var resetBuilderFolder: () => void;
declare var setBuilderFolder: any;
