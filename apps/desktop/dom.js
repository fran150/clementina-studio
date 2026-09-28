/** The page element with this id. */
export const $ = (id) => document.getElementById(id);
/**
 * Whether an element is a text field, select or text area, which keeps its
 * own keys.
 * @param {EventTarget | Element | null | undefined} el
 */
export const isField = (el) => /INPUT|SELECT|TEXTAREA/.test(/** @type {Element} */ (el)?.tagName);
/** Whether the focus is in something the user types into. */
export const editingText = () =>
  isField(document.activeElement) ||
  !!(/** @type {HTMLElement} */ (document.activeElement)?.isContentEditable);
