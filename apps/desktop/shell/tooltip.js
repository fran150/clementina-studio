// Tooltips: a button's title (or label) shows below it after a short
// hover or on keyboard focus, and hides on any click, key, scroll or blur.
import { clamp } from '../domain/geometry.js';
const tooltip = document.createElement('div');
tooltip.id = 'studioTooltip';
tooltip.setAttribute('role', 'tooltip');
tooltip.hidden = true;
let tipTimer, tipTarget;
function hideTip() {
  clearTimeout(tipTimer);
  tooltip.hidden = true;
  tipTarget = null;
}
function showTip(target) {
  hideTip();
  const text = target.title || target.getAttribute('aria-label') || target.textContent.trim();
  if (!text) return;
  tipTarget = target;
  tipTimer = setTimeout(() => {
    if (!target.isConnected) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    const r = target.getBoundingClientRect(),
      w = tooltip.offsetWidth,
      h = tooltip.offsetHeight;
    tooltip.style.left = clamp(r.left + r.width / 2 - w / 2, 6, innerWidth - w - 6) + 'px';
    tooltip.style.top =
      (r.bottom + h + 12 < innerHeight ? r.bottom + 7 : Math.max(6, r.top - h - 7)) + 'px';
  }, 300);
}

/** Adds the tooltip to the page and starts following the pointer and focus. */
export function installTooltips() {
  document.body.append(tooltip);
  document.addEventListener('pointerover', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.('button,summary');
    if (b && b !== tipTarget) showTip(b);
  });
  document.addEventListener('pointerout', (e) => {
    if (tipTarget && !tipTarget.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.('button,summary');
    if (b) showTip(b);
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('pointerdown', hideTip);
  window.addEventListener('blur', hideTip);
  document.addEventListener('keydown', hideTip);
  document.addEventListener('scroll', hideTip, true);
}
