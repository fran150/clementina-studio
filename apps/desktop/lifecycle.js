// The steps every editor takes part in. The core adds each step's own work
// first, as it loads before the editors; each editor then adds what it needs
// done before or after.

/**
 * @template {any[]} A
 * @typedef {((...args: A) => void) & {
 *   before(part: (...args: A) => void): void,
 *   after(part: (...args: A) => void): void,
 * }} Step
 */

/**
 * A step that others add to. Calling it runs the `before` parts newest first,
 * then the `after` parts oldest first, as if each had wrapped the step in turn.
 * @returns {Step<any[]>}
 */
function step() {
  const before = [],
    after = [];
  const run = (...args) => {
    for (let i = before.length - 1; i >= 0; i--) before[i](...args);
    for (const part of after) part(...args);
  };
  run.before = (part) => before.push(part);
  run.after = (part) => after.push(part);
  return run;
}

/** Every editor redraws on a config change, since all of them preview through it. */
export const redrawAll = /** @type {Step<[]>} */ (step());
/** Switches the workspace to another editor. */
export const showView = /** @type {Step<[view: string]>} */ (step());
/** File > New: starts an empty project. The caller asks before discarding edits. */
export const newProject = /** @type {Step<[]>} */ (step());
/** Opens a project, from a file or a recovery snapshot, under the given name. */
export const restoreStudioProject = /** @type {Step<[project: any, name?: string]>} */ (step());
// Redraws that other editors ask for directly.
export const renderAnimations = /** @type {Step<[]>} */ (step());
export const renderBankEditor = /** @type {Step<[]>} */ (step());
export const renderBackgrounds = /** @type {Step<[]>} */ (step());
// The Builder's project folder: forgotten for a new project or Save As, and
// taken from a portable project that was opened.
export const resetBuilderFolder = /** @type {Step<[]>} */ (step());
export const setBuilderFolder = /** @type {Step<[root: string]>} */ (step());
