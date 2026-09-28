// Builder edits the manifest settings. Planning, writing, building and running
// go through main-process IPC to the SDK; the renderer never assembles assets.
(() => {
  const host = document.createElement('section');
  host.id = 'builderEditor';
  host.className = 'studioEditor';
  host.hidden = true;
  host.innerHTML = `<aside class="buLibrary studioDock studioDockLeft"><h2>Build assets</h2><p>Include files and choose their default slots. Assets in the same slot are alternatives.</p><div id="buAssets"></div></aside>
 <main class="studioMain"><div class="buTop"><div class="studioBarStart"><button id="buFolder">Project folder…</button><button id="buSave">Save settings</button></div><div class="studioBarEnd"><button id="buBuild">Build</button><button id="buRun">Run in Emulator</button><button id="buStop" hidden>Stop</button></div></div>
 <div id="buStage" class="studioStage"><div class="buHeading"><h2>Memory</h2><span id="buFolderPath">Choose a portable project folder to save or build.</span></div><p>Drag an included asset onto a slot to change its default. The game decides when to load it.</p><div id="buMap"></div><details id="buReport"><summary>Build report</summary><pre id="buDiagnostics">Choose assets in the left dock.</pre></details><figure id="buPreview" hidden><img id="buScreen" width="320" height="200" alt="Emulator screen"><figcaption>Emulator · 320 × 200</figcaption></figure></div><div id="buStatus"></div></main>
 <aside class="buProps studioDock studioDockRight"><h2>Properties</h2><div id="buSelection"></div><h3>Build settings</h3><label>Asset folder<input id="buAssetFolder" value="ASSETS"></label><label class="buCheck"><input type="checkbox" id="buChecks" checked>Runtime checks</label><h3>Emulator tools</h3><button id="buEmulator">Choose emulator…</button><button id="buRenderer">Choose renderer…</button><p>Uses clementina-automation and clementina-render from PATH unless chosen here.</p></aside>`;
  $('spritePanel').after(host);
  host.querySelector('.buTop .studioBarEnd').append(StudioShell.helpButton());
  const style = document.createElement('style');
  style.textContent = `
 #builderEditor .buTop{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;background:var(--panel);flex-wrap:wrap}
 #buStage{padding:20px;overflow:auto;display:block;flex:1;min-height:0}#buStage h2{margin:0;font-size:18px}.buHeading{display:flex;align-items:baseline;justify-content:space-between;gap:16px}.buHeading span{font-size:11px;overflow-wrap:anywhere;color:var(--text-dim)}
 #buStage p,.buLibrary p,.buProps p{font-size:11px;color:var(--text-dim);line-height:1.5}.buLibrary{width:260px}.buProps{width:250px}.buProps label{display:flex;flex-direction:column;gap:4px;margin:12px 0;font-size:11px}.buProps input,.buProps select,#buAssets select{min-width:0;width:100%;box-sizing:border-box;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:5px}.buProps .buCheck{flex-direction:row;align-items:center}.buCheck input{width:auto}
 #buAssets{overflow:auto;min-height:0}#buAssets h3{font-size:11px;text-transform:uppercase;color:var(--text-dim);margin:16px 0 5px}.buAsset{display:grid;grid-template-columns:20px 1fr;gap:5px;padding:7px 3px;border-bottom:1px solid var(--line)}.buAsset>button{text-align:left;overflow:hidden;text-overflow:ellipsis;border:0;padding:0;background:none}.buAsset select{grid-column:2}.buAsset.selected{background:#ffb00014}
 .buMapSection{margin:20px 0}.buMapSection h3{font-size:12px}.buSlots{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px}.buSlot{border:1px solid var(--line);background:var(--panel);padding:11px;text-align:left;min-height:77px;border-radius:5px;cursor:pointer}.buSlot.selected{border-color:var(--ink)}.buSlot:focus{outline:1px solid var(--ink)}.buSlot strong{display:block;font-size:12px}.buSlot small{display:block;color:var(--text-dim);font-size:10px;margin:5px 0}.buSlot progress{width:100%;height:4px;accent-color:var(--ink)}.buSlot .buTag{display:block;padding:5px 7px;margin:5px 0 0;background:#ffb00017;color:var(--ink);font-size:11px}.buReserved{border-left:3px solid #555;padding:8px 12px;font-size:11px;color:var(--text-dim);background:#17181c}.buBankEmpty{font-size:10px;color:var(--text-dim);padding:8px;border:1px dashed var(--line)}
 #buDiagnostics{white-space:pre-wrap;font-size:11px;line-height:1.6}#buReport{margin-top:24px;border-top:1px solid var(--line);padding-top:12px}#buPreview{margin:20px 0}#buScreen{image-rendering:pixelated;max-width:100%;height:auto;border:1px solid var(--line)}#buPreview figcaption{font-size:10px;color:var(--text-dim)}#buSelection code{font-size:10px;display:block;white-space:pre-wrap;margin:7px 0}.buProps button{margin:4px 0}#buStatus{font-size:10px;color:var(--text-dim)}
 @media(max-width:1100px){body.studioWorkspace #workflowNav .brand{margin-right:4px;font-size:10px}body.studioWorkspace #workflowNav button[data-view]{padding:6px 5px}#workflowNav .navProject{margin-left:4px;gap:2px}#workflowNav #configPicker{max-width:95px}.buLibrary{width:210px}.buProps{width:210px}}
 `;
  document.head.append(style);
  const names = {
    paletteConfig: 'Palette configs',
    tileset: 'Tilesets',
    background: 'Backgrounds',
    overlay: 'Overlays',
    sprites: 'Sprite files',
    song: 'Songs',
    sound: 'Sounds',
  };
  const references = {
    paletteConfig: { module: 'palette.s', calls: 'UsePalettes · UsePaletteBank' },
    tileset: { module: 'tileset.s', calls: 'UseTileset' },
    background: {
      module: 'bg_draw.s',
      calls:
        'DrawScreen · DrawRect · DrawRow · DrawColumn · GetCell · SetCell\nLoadRows · LoadColumns · LoadRect (bg_load.s)',
    },
    overlay: { module: 'overlay.s', calls: 'ShowOverlay · FillPlaceholder' },
    sprites: {
      module: 'sprite_draw.s',
      calls:
        'LoadSprites · LoadShape · LoadAnimation · LoadAnimationShapes · ForgetShape\nDrawShape · StartAnimation · TickAnimation · MoveAnimation · StopAnimation',
    },
    song: { module: 'song.s', calls: 'PlaySong · StopSong · SongPosition' },
    sound: { module: 'sound.s', calls: 'PlaySound · TickSound · StopSound' },
  };
  let catalog = [],
    plan = null,
    selection = null,
    root = null,
    busy = false,
    request = 0,
    lastInput = '',
    timer = null,
    moduleSizes = {},
    running = false,
    framePending = false;
  const key = (a) => a.kind + ':' + a.id,
    entry = (a) => builderSettings.include.find((x) => key(x) === key(a));
  const hex = (n) =>
    '$' +
    n
      .toString(16)
      .toUpperCase()
      .padStart(n > 65535 ? 5 : 4, '0');
  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const builtin = () =>
    plan?.slots.filter((s) => s.builtin) ??
    [
      { name: 'palettes', mia: 256, size: 256 },
      ...Array.from({ length: 8 }, (_, i) => ({
        name: 'chr' + i,
        mia: 512 + i * 6144,
        size: 6144,
      })),
      { name: 'overlay', mia: 0x10080, size: 2000 },
    ].map((s) => ({ ...s, builtin: true, space: 'mia', location: s.mia }));
  const slots = () => [
    ...builtin(),
    ...builderSettings.slots.map((s) => ({
      ...s,
      builtin: false,
      space: s.mia === undefined ? 'bank' : 'mia',
    })),
  ];
  function edit(label, fn) {
    ProjectHistory.checkpoint(['builder'], label);
    fn();
    markDirty();
    lastInput = '';
    render();
  }
  function chooseSlot(select, value, change) {
    select.replaceChildren(
      ...slots().map((s) => new Option(s.name, s.name, false, s.name === value)),
    );
    select.onchange = () => change(select.value);
  }
  function assign(a, slot) {
    edit('Change default slot', () => {
      const e = entry(a);
      if (e) e.slot = slot;
      else builderSettings.include.push({ kind: a.kind, id: a.id, slot });
    });
  }
  function select(value) {
    selection = value;
    renderLists();
    renderMap();
    renderProps();
  }
  function renderLists() {
    const list = $('buAssets');
    list.replaceChildren();
    for (const [kind, title] of Object.entries(names)) {
      const assets = catalog.filter((a) => a.kind === kind);
      if (!assets.length) continue;
      list.append(el('h3', title));
      for (const a of assets) {
        const e = entry(a),
          row = el('div', undefined, 'buAsset' + (selection?.asset === key(a) ? ' selected' : ''));
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
    if (!catalog.length)
      list.append(el('p', 'Create assets in the other editors to include them here.'));
  }
  function renderMap() {
    const map = $('buMap');
    map.replaceChildren();
    const section = (title) => {
      const s = el('section', undefined, 'buMapSection');
      s.append(el('h3', title));
      map.append(s);
      return s;
    };
    const slotCard = (s) => {
      const b = el('div', undefined, 'buSlot' + (selection?.slot === s.name ? ' selected' : ''));
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
          ...assets.map((a) => plan?.assets.find((p) => key(p) === key(a))?.bytes.length ?? 0),
        );
      const meter = el('progress');
      meter.max = s.size;
      meter.value = used;
      b.append(meter);
      for (const a of assets)
        b.append(el('span', catalog.find((c) => key(c) === key(a))?.name ?? a.id, 'buTag'));
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
        const a = catalog.find(
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
  function renderProps() {
    const p = $('buSelection');
    p.replaceChildren();
    const s = slots().find((s) => s.name === selection?.slot),
      a = catalog.find((a) => key(a) === selection?.asset);
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
            selection = { slot: name };
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
        built = plan?.assets.find((x) => key(x) === key(a));
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
          moduleSizes[ref.module] === undefined
            ? 'Build to see module code sizes.'
            : modules.map((m) => `${m}: ${moduleSizes[m]} B`).join(' · '),
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
  function addSlot(copy) {
    let n = 1;
    while (slots().some((s) => s.name === 'slot' + n)) n++;
    edit(copy ? 'Paste slot' : 'New slot', () => {
      const slot = copy
        ? { ...copy, name: 'slot' + n }
        : {
            name: 'slot' + n,
            mia: Math.max(
              0x14000,
              ...builderSettings.slots
                .filter((s) => s.mia !== undefined)
                .map((s) => s.mia + s.size),
            ),
            size: 8192,
          };
      builderSettings.slots.push(slot);
      selection = { slot: slot.name };
    });
  }
  function remove() {
    const slot = builderSettings.slots.find((s) => s.name === selection?.slot);
    if (!slot) return false;
    edit('Delete slot', () => {
      builderSettings.slots = builderSettings.slots.filter((s) => s !== slot);
      selection = null;
    });
    return true;
  }
  function copy() {
    const s = builderSettings.slots.find((s) => s.name === selection?.slot);
    if (!s) return false;
    StudioShell.clipboard.set('builderSlot', s);
    return true;
  }
  function paste() {
    const s = StudioShell.clipboard.get('builderSlot');
    if (!s) return false;
    addSlot(s);
    return true;
  }
  StudioShell.editActions('builder', { copy, cut: () => copy() && remove(), paste });
  const action = (id, label, icon, fn) =>
    Object.assign(StudioShell.iconButton(id, label, icon), { onclick: fn });
  const left = StudioShell.toolRail('buRail', 'Builder tools');
  host.prepend(left);
  const library = StudioShell.iconButton('buLibraryToggle', 'Build assets', 'tileset');
  StudioShell.bindPanel({
    panel: host.querySelector('.buLibrary'),
    button: library,
    group: 'buLeft',
  });
  StudioShell.railLayout(
    left,
    [
      [library],
      [
        action('buSelect', 'Select assets and slots', 'select', () => {}),
        action('buNewSlot', 'New memory slot', 'newItem', () => addSlot()),
      ],
    ],
    [
      action('buCopy', 'Copy slot', 'copy', copy),
      action('buPaste', 'Paste slot', 'paste', paste),
      action('buUndo', 'Undo', 'undo', ProjectHistory.undo),
      action('buRedo', 'Redo', 'redo', ProjectHistory.redo),
    ],
  );
  const right = StudioShell.toolRail('buRightRail', 'Builder properties', 'right');
  host.append(right);
  const props = StudioShell.iconButton('buPropsToggle', 'Properties', 'properties');
  StudioShell.bindPanel({ panel: host.querySelector('.buProps'), button: props, group: 'buRight' });
  StudioShell.railLayout(right, [[props], [action('buDelete', 'Delete slot', 'delete', remove)]]);
  StudioShell.viewStatus('builder', $('buStatus'));
  function diagnostics(items) {
    $('buDiagnostics').textContent = items.length
      ? items.map((d) => `${d.severity}: ${d.path ?? ''} ${d.message}`).join('\n')
      : 'No build errors or warnings.';
    $('buStatus').textContent = items.length
      ? `${items.filter((d) => d.severity === 'error').length} errors · ${items.filter((d) => d.severity === 'warning').length} warnings`
      : `${builderSettings.include.length} ${builderSettings.include.length === 1 ? 'asset' : 'assets'} included`;
  }
  async function refresh(input) {
    const id = ++request;
    try {
      const r = await window.studio.builderPlan(studioProject(), builderSettings, baseName());
      if (id !== request) return;
      catalog = r.catalog ?? [];
      plan = r.ok ? r.value : null;
      diagnostics(r.diagnostics);
      renderLists();
      renderMap();
      renderProps();
    } catch (e) {
      if (id === request) diagnostics([{ severity: 'error', message: e.message }]);
    }
  }
  function render() {
    host.hidden = currentView !== 'builder';
    if (host.hidden) return;
    renderLists();
    renderMap();
    renderProps();
    const input = JSON.stringify(studioProject());
    if (input !== lastInput && window.studio?.builderPlan) {
      lastInput = input;
      clearTimeout(timer);
      timer = setTimeout(() => refresh(input), 80);
    }
    for (const id of ['buSave', 'buBuild', 'buRun']) $(id).disabled = busy || !root;
    $('buUndo').disabled = !ProjectHistory.canUndo();
    $('buRedo').disabled = !ProjectHistory.canRedo();
  }
  $('buAssetFolder').onchange = () =>
    edit('Change asset folder', () => (builderSettings.folder = $('buAssetFolder').value));
  $('buChecks').onchange = () =>
    edit('Change runtime checks', () => (builderSettings.checks = $('buChecks').checked));
  $('buFolder').onclick = () =>
    studioAction(async () => {
      const result = await window.studio.builderFolder();
      if (!result) return;
      if (!result.fresh) {
        if (dirty && !confirm('Discard unsaved changes?')) return;
        restoreStudioProject(result.project, result.name);
        await window.studio.opened(result.root + '/clementina.yaml', 'portable');
        setBuilderFolder(result.root);
        setStatus('Opened ' + result.name);
      } else {
        await window.studio.builderFolderSelected(result.root);
        setBuilderFolder(result.root);
      }
    });
  for (const [id, kind] of [
    ['buEmulator', 'emulator'],
    ['buRenderer', 'renderer'],
  ])
    $(id).onclick = () =>
      studioAction(async () => {
        const path = await window.studio.builderTool(kind);
        if (path) {
          $(id).title = path;
          $(id).textContent = path.split('/').at(-1);
        }
      });
  async function frames() {
    if (!running || framePending) return;
    framePending = true;
    try {
      const image = await window.studio.builderFrame();
      if (image) {
        $('buScreen').src = image;
        $('buPreview').hidden = false;
      }
    } catch (e) {
      setStatus('Emulator is running. Screen preview: ' + e.message);
      running = false;
    } finally {
      framePending = false;
      if (running) setTimeout(frames, 250);
    }
  }
  async function perform(action) {
    if (busy) return;
    busy = true;
    render();
    setStatus(
      action === 'run'
        ? 'Building and starting emulator…'
        : action === 'build'
          ? 'Building…'
          : 'Saving…',
    );
    try {
      const r = await window.studio.builderAction(
        action,
        studioProject(),
        builderSettings,
        baseName(),
      );
      diagnostics(r.diagnostics ?? []);
      $('buReport').open = true;
      if (r.ok) {
        moduleSizes = r.moduleSizes ?? moduleSizes;
        setStatus(
          r.message ?? (action === 'stop' ? 'Emulator stopped.' : `Built SD card: ${r.sdRoot}`),
        );
        if (action === 'run') {
          running = true;
          $('buStop').hidden = false;
          frames();
        }
        if (action === 'stop') {
          running = false;
          $('buStop').hidden = true;
        }
      } else
        setStatus(
          r.message ?? `${action === 'save' ? 'Save' : 'Build'} failed. See the build report.`,
        );
    } catch (e) {
      diagnostics([{ severity: 'error', message: e.message }]);
      setStatus(e.message);
    } finally {
      busy = false;
      render();
    }
  }
  for (const action of ['save', 'build', 'run', 'stop'])
    $('bu' + action[0].toUpperCase() + action.slice(1)).onclick = () => perform(action);
  window.addEventListener('keydown', (e) => {
    if (
      currentView === 'builder' &&
      !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) &&
      (e.key === 'Delete' || e.key === 'Backspace')
    ) {
      if (remove()) e.preventDefault();
    }
  });
  document.addEventListener('studiohistory', () => {
    lastInput = '';
  });
  const oldRedraw = redrawAll;
  redrawAll = function () {
    oldRedraw();
    render();
  };
  const oldShow = showView;
  showView = function (v) {
    oldShow(v);
    render();
  };
  window.renderBuilder = render;
  window.resetBuilderFolder = () => {
    root = null;
    selection = null;
    plan = null;
    catalog = [];
    lastInput = '';
    request++;
    $('buFolderPath').textContent = 'Choose a portable project folder to save or build.';
  };
  function setBuilderFolder(folder) {
    root = folder;
    selection = null;
    plan = null;
    catalog = [];
    lastInput = '';
    request++;
    $('buFolderPath').textContent = folder;
    render();
  }
  window.setBuilderFolder = setBuilderFolder;
  render();
})();
