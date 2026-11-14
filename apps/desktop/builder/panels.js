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
import { setStatus } from '../status.js';

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
  renderCpu(section('CPU memory · bank 0'));
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

/** What owns each kind of CPU region in the build's memory layout. */
const owners = {
  system: 'System',
  kernel: 'Kernel',
  basic: 'BASIC',
  program: 'Program',
  asset: 'Asset slot',
};
/**
 * Draws base RAM and bank 0 from the last build's memory layout: the system
 * areas, BASIC's workspace up to MEMSIZ and each PRG, in address order. The
 * SDK decides nothing here: overlaps are its warnings, in the build report.
 */
function renderCpu(section) {
  section.append(memoryTopField());
  const regions = bu.layout?.cpu.filter((r) => !r.bank) ?? [];
  if (!regions.length) {
    section.append(el('p', 'Build to see where the program and BASIC sit in CPU memory.'));
    return;
  }
  const overlaps = new Set(
    (bu.layout.diagnostics ?? []).flatMap((d) =>
      regions.filter((r) => d.message.includes(r.name + ' (')),
    ),
  );
  const list = el('div', undefined, 'buCpu');
  for (const r of [...regions].sort((a, b) => a.start - b.start || b.size - a.size)) {
    const row = el(
      'div',
      undefined,
      'buCpuRegion ' + r.owner + (overlaps.has(r) ? ' overlap' : ''),
    );
    row.append(
      el('strong', `${owners[r.owner] ?? r.owner} · ${r.name}`),
      el('small', `${hex(r.start)}–${hex(r.start + r.size - 1)} · ${r.size.toLocaleString()} B`),
    );
    if (r.note) row.title = r.note;
    list.append(row);
  }
  section.append(list);
}

/** Where BASIC's memory ends when there is no memoryTop: MEMSIZ at cold start. */
const BASIC_TOP = 0xc000;
/**
 * build.basic.memoryTop: lowers MEMSIZ so bank-0 RAM from there to $BFFF is
 * free for assembly the BASIC program calls. Only a project with a BASIC
 * program has one; the PRG's own address stays in link.cfg.
 */
function memoryTopField() {
  const row = el('div', undefined, 'buMemoryTop');
  if (!bu.basic) {
    row.append(
      el(
        'small',
        'The program loads where link.cfg puts it. A project with a BASIC program (program.entry) can also set memoryTop.',
      ),
    );
    return row;
  }
  const label = el('label', 'BASIC memory top (memoryTop) ');
  const input = el('input');
  input.value = bu.basic.memoryTop === null ? '' : hex(bu.basic.memoryTop);
  input.placeholder = hex(BASIC_TOP);
  input.setAttribute('aria-label', 'BASIC memory top');
  const note = el('small');
  const describe = () =>
    (note.textContent =
      bu.basic.memoryTop === null
        ? ' BASIC uses bank 0 up to $BFFF.'
        : ` ${hex(bu.basic.memoryTop)}–$BFFF is free for assembly; BASIC stays below it.`);
  describe();
  input.onchange = () => {
    const text = input.value.trim();
    const value = text === '' ? null : Number.parseInt(text.replace(/^\$/, ''), 16);
    if (value !== null && !(value >= 0x1600 && value <= BASIC_TOP)) {
      note.textContent = ' Enter a hex address from $1600 to $C000, or leave it empty.';
      return;
    }
    bu.basic.memoryTop = value;
    describe();
    setStatus('memoryTop is written to clementina.yaml by the next Save, Build or Run.');
  };
  label.append(input);
  row.append(label, note);
  return row;
}
