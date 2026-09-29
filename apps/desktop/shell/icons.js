// The studio's icons. One glyph per concept, and each glyph means one thing everywhere: an asset
// type looks the same on its library button in every editor, and a tool or
// action looks the same in every rail. Drawn on a 26-unit grid; a glyph
// drawn on 24 units is centered with c().

const c = (path) => `<g transform="translate(1 1)">${path}</g>`;
export const icons = Object.freeze({
  // Assets, as their library and picker panels show them.
  palette: c(
    '<path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a3 3 0 0 0 3-3 8 8 0 0 0-8-8z"/><circle cx="7.5" cy="12" r="1.2" fill="currentColor"/><circle cx="9.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7" r="1.2" fill="currentColor"/><circle cx="17.5" cy="11" r="1.2" fill="currentColor"/>',
  ),
  bankConfig: c(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ),
  tileset: '<path d="M5 2h11l5 5v17H5zM16 2v6h5"/><path d="M8 12h10v8H8zM13 12v8M8 16h10"/>',
  tilePicker: c(
    '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>',
  ),
  background: c(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 17 5-6 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/>',
  ),
  overlay: c('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 8h5M15 8h3M6 16h12"/>'),
  shape: c('<path d="M9 3h6v5H9zM6 8h12v7H6zM7 15h4v6H7zM13 15h4v6h-4z"/>'),
  animation: c(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16"/><path d="M3 9h5M16 9h5M3 15h5M16 15h5"/>',
  ),
  placeholder: c(
    '<rect x="3" y="7" width="18" height="10" rx="1" stroke-dasharray="3 2"/><path d="M7 12h7"/>',
  ),
  sound: c(
    '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12"/>',
  ),
  music: c(
    '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/><path d="M9 10l11-2"/>',
  ),
  instrument: c(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 14h2l2-6 3 9 2-5 1 2h2"/>',
  ),
  // Panels showing the current selection's properties.
  drawOrder: c('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>'),
  camera: c('<rect x="2" y="6" width="14" height="12" rx="1"/><path d="m16 10 6-3v10l-6-3"/>'),
  properties: c(
    '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  ),
  // Tools.
  move: c('<path d="m5 3 13 7.5-5.5 1.8L10 18z"/>'),
  select: '<rect x="3" y="3" width="19" height="19" stroke-dasharray="3 3"/>',
  pencil: '<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',
  eraser:
    '<path d="m3 15 9-10a2 2 0 0 1 3 0l7 6a2 2 0 0 1 0 3l-6 7H9z"/><path d="m8 10 10 8M9 21h14"/><path d="m3 15 5-5 10 8-3 3H9z" fill="currentColor" opacity=".3"/>',
  fill: '<path d="m4 12 8-8 9 9-8 8z"/><path d="M7 9V5a3 3 0 0 1 6 0v3M4 12h16"/><path d="M22 14c-1 2-3 4-3 6a3 3 0 0 0 6 0c0-2-2-4-3-6z" fill="currentColor"/><path d="m5 13 8 7 7-7" fill="currentColor" opacity=".3"/>',
  line: '<path d="M4 20 20 4"/>',
  rectangle: '<rect x="3" y="5" width="18" height="14"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  picker:
    '<path d="m15 4 2-2a3 3 0 0 1 4 4l-2 2 2 2-3 3-7-7 3-3z" fill="currentColor"/><path d="m12 8-9 9v4h4l9-9M3 21l-1 2"/>',
  place: c('<rect x="4" y="12" width="16" height="9"/><path d="M12 2v8M8.5 6.5 12 10l3.5-3.5"/>'),
  placeholderTool: c(
    '<rect x="2" y="7" width="15" height="10" rx="1" stroke-dasharray="3 2"/><path d="M20 3v6M17 6h6"/>',
  ),
  origin: c('<circle cx="12" cy="12" r="3"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>'),
  // Playback.
  play: c('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  pause: c(
    '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  ),
  previous: c('<path d="M6 5v14"/><path d="M19 5 9 12l10 7z" fill="currentColor"/>'),
  next: c('<path d="M18 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/>'),
  stop: c('<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/>'),
  mute: c('<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="m16 9 6 6M22 9l-6 6"/>'),
  pan: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10V6a2 2 0 0 0-4 0v8c0 4 2 7 7 7s7-3 7-7v-4a2 2 0 0 0-4 0v1"/>',
  // Actions.
  undo: '<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>',
  redo: '<path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7"/>',
  copy: '<rect x="8" y="8" width="14" height="14"/><path d="M17 8V3H3v14h5"/>',
  paste: '<path d="M9 5H5v18h16V5h-4"/><rect x="9" y="2" width="8" height="5" rx="1"/>',
  newItem: c('<path d="M12 4v16M4 12h16"/>'),
  duplicate: c(
    '<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5M14.5 11.5v6M11.5 14.5h6"/>',
  ),
  import: c(
    '<path d="M12 3v10m0 0-3.5-3.5M12 13l3.5-3.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  ),
  delete: c('<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>'),
  close: c('<path d="m6 6 12 12M18 6 6 18"/>'),
  // Transforms and arrangement of the selection.
  flipH: '<path d="M13 2v22" stroke-dasharray="2 2"/><path d="m3 6 7 7-7 7zM23 6l-7 7 7 7z"/>',
  flipV: '<path d="M2 13h22" stroke-dasharray="2 2"/><path d="m6 3 7 7 7-7zM6 23l7-7 7 7z"/>',
  rotate: '<path d="M20 8a9 9 0 1 0 2 9M20 2v6h-6"/><rect x="8" y="10" width="8" height="8"/>',
  priority: c(
    '<rect x="3" y="9" width="12" height="12"/><rect x="9" y="3" width="12" height="12" fill="currentColor" fill-opacity=".35"/>',
  ),
  front: c('<path d="M12 20V9M6 14l6-6 6 6"/><path d="M5 3h14"/>'),
  forward: c('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  backward: c('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  back: c('<path d="M12 4v11M6 10l6 6 6-6"/><path d="M5 21h14"/>'),
  earlier: c('<path d="M19 12H5M11 5l-7 7 7 7"/>'),
  later: c('<path d="M5 12h14M13 5l7 7-7 7"/>'),
  // Pitch: a semitone up or down, and a legato slide into a note.
  transposeUp: c(
    '<circle cx="7" cy="18" r="3"/><path d="M10 18V6M17 13V3M13.5 6.5 17 3l3.5 3.5"/>',
  ),
  transposeDown: c(
    '<circle cx="7" cy="18" r="3"/><path d="M10 18V6M17 3v10M13.5 9.5 17 13l3.5-3.5"/>',
  ),
  legato: c(
    '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="15" r="2.5"/><path d="M4 11c4-6 12-6 16-2"/>',
  ),
  // View.
  grid: c(
    '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke-dasharray="1.5 1.5"/>',
  ),
  snap: c(
    '<path d="M4 4h16M4 12h16M4 20h16M4 4v16M12 4v16M20 4v16"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>',
  ),
  settings:
    '<path d="M3 6h20M3 13h20M3 20h20"/><rect x="7" y="3" width="4" height="6" fill="var(--panel)"/><rect x="16" y="10" width="4" height="6" fill="var(--panel)"/><rect x="8" y="17" width="4" height="6" fill="var(--panel)"/>',
  miniature:
    '<rect x="2" y="4" width="22" height="18"/><rect x="6" y="8" width="7" height="7"/><path d="M16 8h3M16 12h3M16 16h3"/>',
});
// `path` is an icon name above, or — for the project file icons — raw markup.
export function setIcon(
  button,
  path,
  label,
  { size = 27, viewBox = '0 0 26 26', rounded = true } = {},
) {
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<svg viewBox="${viewBox}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" ${rounded ? 'stroke-linecap="round" stroke-linejoin="round"' : ''} aria-hidden="true">${icons[path] ?? path}</svg>`;
  return button;
}
/** A new button with id `id`, the icon `path` and the label `label`. */
export function iconButton(id, label, path, options) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  return setIcon(button, path, label, options);
}
