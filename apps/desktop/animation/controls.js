// The animation editor's keyboard shortcuts and rails. The left rail holds
// the Animations and Shapes panels, then copy, paste, undo and redo; the
// right rail holds the frame properties panel and the selected frame's
// actions.
import { $, isField } from '../dom.js';
import { currentView } from '../state.js';
import { StudioShell } from '../studio-shell.js';

/**
 * Wires up the animation editor's keys.
 *
 * @param {any} actions The frame actions (see frames.js).
 */
export function animationKeys({ copyFrame, cutFrame, pasteFrames, flipFrame, removeFrame }) {
  window.addEventListener(
    'keydown',
    (e) => {
      if (
        currentView !== 'animations' ||
        isField(e.target) ||
        document.querySelector('dialog[open]')
      )
        return;
      const key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey,
        handled = () => {
          e.preventDefault();
          e.stopImmediatePropagation();
        };
      if (mod && ['c', 'x', 'v', 'd'].includes(key)) {
        const done =
          key === 'd'
            ? ($('anDuplicateFrame').click(), true)
            : { c: copyFrame, x: cutFrame, v: pasteFrames }[key]();
        if (done || key === 'd') handled();
        return;
      }
      if (mod || e.altKey) return;
      if (e.shiftKey && (key === 'h' || key === 'v')) {
        handled();
        flipFrame(key === 'h' ? 'x' : 'y');
        return;
      }
      // Keys a focused button or frame card already answers are left to it.
      if (/** @type {HTMLElement} */ (e.target).closest?.('button,[role="option"]')) return;
      if (e.code === 'Space') {
        handled();
        $('anPlay').click();
        return;
      }
      if (key === 'arrowleft' || key === 'arrowright') {
        handled();
        (key === 'arrowleft' ? $('anPrevious') : $('anNext')).click();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        handled();
        removeFrame();
      }
    },
    true,
  );
}

/**
 * Builds the left rail, with the help button in the top bar.
 *
 * @param {HTMLElement} host The animation editor's section.
 * @param {any} actions The frame actions (see frames.js).
 */
export function animationRail(host, { copyFrame, pasteFrames }) {
  host.querySelector('.anTop .studioBarEnd').append(StudioShell.helpButton());
  const panelToggle = (panel, id, label, icon, asset = false) => {
    const b = StudioShell.iconButton(id, label, icon);
    StudioShell.bindPanel({
      panel,
      button: b,
      group: 'animation',
      closeGroups: ['animation'],
      asset,
    });
    return b;
  };
  const rail = StudioShell.toolRail('anRail', 'Animation tools');
  host.prepend(rail);
  StudioShell.railLayout(
    rail,
    [
      [
        panelToggle(host.querySelector('.anLibrary'), 'anLibraryToggle', 'Animations', 'animation'),
        panelToggle(
          host.querySelector('.anShapeLibrary'),
          'anShapeLibraryToggle',
          'Shapes to append',
          'shape',
          true,
        ),
      ],
    ],
    [
      Object.assign(StudioShell.iconButton('anCopy', 'Copy frame (Ctrl/Cmd+C)', 'copy'), {
        onclick: copyFrame,
      }),
      Object.assign(
        StudioShell.iconButton('anPaste', 'Paste frame after this one (Ctrl/Cmd+V)', 'paste'),
        { onclick: pasteFrames },
      ),
      ...StudioShell.historyButtons('an'),
    ],
  );
}

/**
 * Builds the right rail: the selected frame's panel and actions, on the
 * right like any selection's.
 *
 * @param {HTMLElement} host The animation editor's section.
 * @param {any} actions The frame actions (see frames.js).
 */
export function frameRail(host, { flipFrame, removeFrame }) {
  StudioShell.setIcon($('anPrevious'), 'previous', 'Previous frame (←)');
  StudioShell.setIcon($('anNext'), 'next', 'Next frame (→)');
  const rail = StudioShell.toolRail('anFrameRail', 'Frame actions', 'right');
  host.append(rail);
  const framePanelToggle = StudioShell.iconButton(
    'anFramePanelToggle',
    'Frame properties',
    'properties',
  );
  StudioShell.bindPanel({
    panel: host.querySelector('.anFramePanel'),
    button: framePanelToggle,
    group: 'animationRight',
    closeGroups: ['animationRight'],
    asset: true,
  });
  for (const [id, icon, label] of [
    ['anDuplicateFrame', 'duplicate', 'Duplicate frame (Ctrl/Cmd+D)'],
    ['anMoveEarlier', 'earlier', 'Move frame earlier'],
    ['anMoveLater', 'later', 'Move frame later'],
  ])
    StudioShell.setIcon($(id), icon, label);
  const flipButton = (id, axis, icon, label) =>
    Object.assign(StudioShell.iconButton(id, label, icon), { onclick: () => flipFrame(axis) });
  StudioShell.railLayout(rail, [
    [framePanelToggle],
    [
      flipButton(
        'anFlipX',
        'x',
        'flipH',
        'Flip the frame horizontally (Shift+H) — mirrors the shape about its origin',
      ),
      flipButton(
        'anFlipY',
        'y',
        'flipV',
        'Flip the frame vertically (Shift+V) — mirrors the shape about its origin',
      ),
    ],
    [$('anDuplicateFrame'), $('anMoveEarlier'), $('anMoveLater')],
    [
      Object.assign(StudioShell.iconButton('anRemoveFrame', 'Remove frame (Delete)', 'delete'), {
        onclick: removeFrame,
      }),
    ],
  ]);
}
