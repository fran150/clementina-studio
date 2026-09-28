// What the renderer's modules find on window, set by the preload script and
// the page, and the element type their DOM lookups return.

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
