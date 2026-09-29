// The Properties panel: the selected slot's name, place, address and size,
// or the selected asset's slot, file name and runtime routines.
import { $ } from '../dom.js';
import { builderSettings } from '../state.js';
import { assign, bu, chooseSlot, edit, el, entry, hex, key, references, slots } from './model.js';
import { remove } from './slots.js';

function field(parent, label, value, change, type = 'text') {
  const l = el('label', label),
    i = el('input');
  i.type = type;
  i.value = value;
  i.setAttribute('aria-label', label);
  i.onchange = () => change(i.value);
  l.append(i);
  parent.append(l);
  return i;
}
/** Draws the Properties panel for the selection. */
export function renderProps() {
  const p = $('buSelection');
  p.replaceChildren();
  const s = slots().find((s) => s.name === bu.selection?.slot),
    a = bu.catalog.find((a) => key(a) === bu.selection?.asset);
  if (s) {
    p.append(el('h3', s.name));
    if (s.builtin) p.append(el('p', 'Built-in hardware slot.'));
    else {
      const update = (label, fn) =>
        edit(label, () => fn(builderSettings.slots.find((x) => x.name === s.name)));
      field(p, 'Name', s.name, (name) =>
        update('Rename slot', (slot) => {
          const before = slot.name;
          slot.name = name;
          for (const e of builderSettings.include) if (e.slot === before) e.slot = name;
          bu.selection = { slot: name };
        }),
      );
      const place = el('select');
      place.append(new Option('MIA RAM', 'mia'), new Option('CPU bank', 'bank'));
      place.value = s.space;
      place.setAttribute('aria-label', 'Place');
      const placeLabel = el('label', 'Place');
      place.onchange = () =>
        update('Change slot place', (slot) => {
          if (place.value === 'bank') {
            delete slot.mia;
            slot.bank = 1;
            slot.address = 0x8000;
            slot.size = Math.min(slot.size, 0x4000);
          } else {
            delete slot.bank;
            delete slot.address;
            slot.mia = 0x14000;
          }
        });
      placeLabel.append(place);
      p.append(placeLabel);
      if (s.space === 'bank')
        field(
          p,
          'Bank',
          s.bank,
          (n) => update('Change slot bank', (slot) => (slot.bank = Number(n))),
          'number',
        );
      field(p, 'Address', hex(s.mia ?? s.address), (n) =>
        update(
          'Change slot address',
          (slot) => (slot[s.space === 'mia' ? 'mia' : 'address'] = Number(n.replace('$', '0x'))),
        ),
      );
      field(
        p,
        'Size (bytes)',
        s.size,
        (n) => update('Resize slot', (slot) => (slot.size = Number(n))),
        'number',
      );
      const del = el('button', 'Delete slot');
      del.onclick = remove;
      p.append(del);
    }
  } else if (a) {
    const e = entry(a),
      built = bu.plan?.assets.find((x) => key(x) === key(a));
    p.append(el('h3', a.name));
    p.append(
      el(
        'p',
        built
          ? `${built.bytes.length.toLocaleString()} bytes · ${built.label}`
          : 'Include this asset to plan its file.',
      ),
    );
    if (e) {
      const pick = el('select'),
        slotLabel = el('label', 'Default slot');
      pick.setAttribute('aria-label', 'Default slot');
      chooseSlot(pick, e.slot, (slot) => assign(a, slot));
      slotLabel.append(pick);
      p.append(slotLabel);
      field(p, 'File name', e.file ?? built?.file ?? '', (name) =>
        edit('Change asset file name', () => {
          if (name) e.file = name;
          else delete e.file;
        }),
      );
    }
    const ref = references[a.kind];
    p.append(
      el('h3', 'Runtime routines'),
      el(
        'code',
        'Load · LoadStart / LoadBusy / LoadWait\nLoadPart · Relocate · Forget\n' + ref.calls,
      ),
    );
    const modules = [
      'load.s',
      'relocate.s',
      ref.module,
      ...(a.kind === 'background'
        ? ['bg_load.s']
        : a.kind === 'sprites'
          ? ['items.s', 'sprite_load.s', 'animation.s']
          : a.kind === 'song' || a.kind === 'sound'
            ? ['audio.s']
            : []),
    ];
    p.append(
      el(
        'p',
        bu.moduleSizes[ref.module] === undefined
          ? 'Build to see module code sizes.'
          : modules.map((m) => `${m}: ${bu.moduleSizes[m]} B`).join(' · '),
      ),
    );
    p.append(
      el(
        'p',
        'Sizes are per library module. The linker includes referenced modules and their shared helpers.',
      ),
    );
  } else p.append(el('p', 'Select an asset or memory slot.'));
  $('buAssetFolder').value = builderSettings.folder ?? 'ASSETS';
  $('buChecks').checked = builderSettings.checks !== false;
}
