// The builder's two main panels: the asset list, where assets are included
// and given a default slot, and the memory map, where slots are chosen and
// assets are dropped onto them.
import { $ } from '../dom.js';
import { builderSettings } from '../state.js';
import {
  assign,
  bu,
  builtin,
  chooseSlot,
  edit,
  el,
  entry,
  hex,
  key,
  names,
  slots,
} from './model.js';
import { renderProps } from './props.js';

/** Selects an asset or slot and redraws the panels. */
export function select(value) {
  bu.selection = value;
  renderLists();
  renderMap();
  renderProps();
}
/** Draws the asset list, grouped by kind. */
export function renderLists() {
  const list = $('buAssets');
  list.replaceChildren();
  for (const [kind, title] of Object.entries(names)) {
    const assets = bu.catalog.filter((a) => a.kind === kind);
    if (!assets.length) continue;
    list.append(el('h3', title));
    for (const a of assets) {
      const e = entry(a),
        row = el('div', undefined, 'buAsset' + (bu.selection?.asset === key(a) ? ' selected' : ''));
      row.dataset.asset = key(a);
      row.draggable = !!e;
      const check = el('input');
      check.type = 'checkbox';
      check.checked = !!e;
      check.setAttribute('aria-label', 'Include ' + a.name);
      check.onchange = () =>
        edit((check.checked ? 'Include ' : 'Exclude ') + a.name, () => {
          if (check.checked)
            builderSettings.include.push({
              kind: a.kind,
              id: a.id,
              slot:
                kind === 'paletteConfig'
                  ? 'palettes'
                  : kind === 'tileset'
                    ? 'chr0'
                    : kind === 'overlay'
                      ? 'overlay'
                      : (builderSettings.slots[0]?.name ?? 'chr7'),
            });
          else builderSettings.include = builderSettings.include.filter((x) => key(x) !== key(a));
        });
      const button = el('button', a.name);
      button.onclick = () => select({ asset: key(a) });
      row.append(check, button);
      if (e) {
        const pick = el('select');
        pick.setAttribute('aria-label', a.name + ' default slot');
        chooseSlot(pick, e.slot, (slot) => assign(a, slot));
        row.append(pick);
      }
      row.ondragstart = (event) =>
        event.dataTransfer.setData('application/clementina-asset', key(a));
      list.append(row);
    }
  }
  if (!bu.catalog.length)
    list.append(el('p', 'Create assets in the other editors to include them here.'));
}
/** Draws the memory map: MIA RAM's hardware and free slots, then the CPU banks. */
export function renderMap() {
  const map = $('buMap');
  map.replaceChildren();
  const section = (title) => {
    const s = el('section', undefined, 'buMapSection');
    s.append(el('h3', title));
    map.append(s);
    return s;
  };
  const slotCard = (s) => {
    const b = el('div', undefined, 'buSlot' + (bu.selection?.slot === s.name ? ' selected' : ''));
    b.tabIndex = 0;
    b.role = 'button';
    b.setAttribute('aria-label', s.name + ' slot');
    b.dataset.slot = s.name;
    b.append(
      el('strong', s.name),
      el(
        'small',
        (s.space === 'bank' ? `Bank ${s.bank} · ${hex(s.address)}` : hex(s.mia)) +
          ' · ' +
          s.size.toLocaleString() +
          ' B',
      ),
    );
    const assets = builderSettings.include.filter((a) => a.slot === s.name),
      used = Math.max(
        0,
        ...assets.map((a) => bu.plan?.assets.find((p) => key(p) === key(a))?.bytes.length ?? 0),
      );
    const meter = el('progress');
    meter.max = s.size;
    meter.value = used;
    b.append(meter);
    for (const a of assets)
      b.append(el('span', bu.catalog.find((c) => key(c) === key(a))?.name ?? a.id, 'buTag'));
    b.onclick = () => select({ slot: s.name });
    b.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select({ slot: s.name });
      }
    };
    b.ondragover = (e) => e.preventDefault();
    b.ondrop = (e) => {
      e.preventDefault();
      const a = bu.catalog.find(
        (a) => key(a) === e.dataTransfer.getData('application/clementina-asset'),
      );
      if (a) assign(a, s.name);
    };
    return b;
  };
  const mia = section('MIA RAM · 256 KiB');
  mia.append(
    el('div', '$00000–$0003F video control · gaps are not offered as slots', 'buReserved'),
  );
  const hardware = el('div', undefined, 'buSlots');
  for (const s of builtin()) hardware.append(slotCard(s));
  mia.append(hardware);
  mia.append(
    el(
      'div',
      '$0C200–$1007F backgrounds · $10850–$10D4F OAM · $11000 input · $12000 audio · $13000–$13BFF SD/FS',
      'buReserved',
    ),
  );
  const free = section('Free MIA RAM · $14000–$3FFFF');
  const fs = el('div', undefined, 'buSlots');
  for (const s of slots().filter((s) => !s.builtin && s.space === 'mia')) fs.append(slotCard(s));
  if (!fs.children.length) fs.append(el('p', 'Add a slot for maps, sprites, songs or sounds.'));
  free.append(fs);
  const banks = section('CPU banks · $8000–$BFFF in each bank');
  const bs = el('div', undefined, 'buSlots');
  for (let bank = 1; bank <= 31; bank++) {
    const list = slots().filter((s) => s.space === 'bank' && s.bank === bank);
    if (list.length) for (const s of list) bs.append(slotCard(s));
    else bs.append(el('div', `Bank ${bank} · 16 KiB`, 'buBankEmpty'));
  }
  banks.append(bs);
}
