// The Builder editor: memory slots with undo, the clipboard and drag and drop,
// a real build into a temporary portable project, File > Open and Save of
// that project, and the layout at 1024×768.
// Run with `npm run test:desktop:builder`.
const path = require('node:path');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { suite } = require('./harness/electron.cjs');

// Filled in by setup, once Electron is ready: the builder's main-process
// functions, the project loader, and the temporary project folder.
let builder, loadProject, root;
let builds = 0;

suite(
  'builder',
  {
    width: 1440,
    height: 960,
    setup: async () => {
      builder = await import('../dist/apps/desktop/builder.js');
      ({ loadProject } = await import('@clementina/project/node'));
      root = await mkdtemp(path.join(tmpdir(), 'desktop-builder-'));
    },
    handlers: {
      'builder:plan': (_e, p, s, n) => builder.inspectBuilder(p, s, n),
      'builder:folder': () => ({ root, fresh: true }),
      'builder:folder-selected': (_e, selected) => {
        assert.equal(selected, root);
      },
      'project:open': async () => {
        const opened = await builder.readPortableStudioProject(root);
        return {
          path: path.join(root, 'clementina.yaml'),
          kind: 'portable',
          root,
          name: opened.portable.manifest.name,
          project: opened.project,
        };
      },
      'project:opened': (_e, selected, kind) => {
        assert.equal(selected, path.join(root, 'clementina.yaml'));
        assert.equal(kind, 'portable');
      },
      'project:save': async (_e, project) => {
        await builder.writePortableStudioProject(root, project, project.builder, 'Test');
        return 'Test';
      },
      'builder:action': async (_e, action, p, s, n) => {
        assert.equal(action, 'build');
        builds++;
        const b = await builder.buildStudioProject(root, p, s, n);
        return b.ok ? { ok: true, diagnostics: b.diagnostics, sdRoot: b.value.sdRoot } : b;
      },
    },
  },
  async ({ run, until, resize, png }) => {
    // Polls a page expression: up to 100 tries, 50 ms apart.
    const waitFor = (condition) =>
      until(condition, { tries: 100, interval: 50, timeout: Infinity });

    await run(`showView('tiles');$('addBankFile').click();showView('builder');`);
    await waitFor(`$('buAssets').querySelectorAll('.buAsset').length>=2`);
    assert.equal(await run(`return $('builderEditor').hidden;`), false);
    // Like every editor, the top bar ends with the shortcut sheet's ? button.
    await run(`$('builderEditor').querySelector('.buTop .studioHelp').click();`);
    assert.deepEqual(
      await run(`return [...$('shortcutHelp').querySelectorAll('h3')].map(h=>h.textContent);`),
      ['Everywhere', 'Builder'],
    );
    await run(`$('shortcutHelp').close();`);
    await run(`$('buNewSlot').click();`);
    assert.equal(await run(`return builderSettings.slots.length;`), 1);
    await run(`$('buUndo').click();`);
    assert.equal(await run(`return builderSettings.slots.length;`), 0);
    await run(`$('buRedo').click();$('buCopy').click();$('buPaste').click();`);
    assert.equal(await run(`return builderSettings.slots.length;`), 2);
    // Move the pasted slot to an adjacent range and include a palette config.
    await run(
      `builderSettings.slots[1].mia=0x16000;renderBuilder();$('buAssets').querySelector('input').click();`,
    );
    await waitFor(`$('buAssets').querySelector('select')!==null`);
    await run(
      `const row=$('buAssets').querySelector('.buAsset'),target=document.querySelector('[data-slot="slot1"]'),dt=new DataTransfer();dt.setData('application/clementina-asset',row.dataset.asset);target.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));`,
    );
    assert.equal(await run(`return builderSettings.include[0].slot;`), 'slot1');
    await run(`$('buFolder').click();`);
    await waitFor(`!$('buBuild').disabled`);
    await run(`$('buBuild').click();`);
    await waitFor(`!$('buBuild').disabled`);
    assert.equal(builds, 1);
    assert.match(await run(`return $('buDiagnostics').textContent;`), /No build errors/);
    // File > Open loads the portable assets into the editors; File > Save writes them back.
    await run(`dirty=false;$('nativeOpen').click();`);
    await waitFor(`projectFile!==null`);
    await waitFor(`$('buFolderPath').textContent===${JSON.stringify(root)}`);
    assert.equal(await run(`return paletteConfigs.length;`), 1);
    await run(`paletteConfigs[0].name='RoundTrip';markDirty();$('nativeSave').click();`);
    await waitFor(`!dirty`);
    assert.equal((await loadProject(root)).value.assets.paletteConfigs[0].name, 'RoundTrip');
    await writeFile('/tmp/clementina-builder-1440.png', await png());
    await resize(1024, 768, 100);
    const bounds = await run(
      `return {width:innerWidth,scroll:document.documentElement.scrollWidth,nav:$('workflowNav').getBoundingClientRect().height,grid:getComputedStyle($('builderEditor')).display};`,
    );
    assert.equal(bounds.scroll, bounds.width);
    assert.equal(bounds.nav, 44);
    assert.equal(bounds.grid, 'grid');
    await writeFile('/tmp/clementina-builder-1024.png', await png());
  },
);
