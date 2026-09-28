const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
app.whenReady().then(async () => {
  const {
    inspectBuilder,
    buildStudioProject,
    readPortableStudioProject,
    writePortableStudioProject,
  } = await import('../dist/apps/desktop/builder.js');
  const { loadProject } = await import('@clementina/project/node');
  const root = await mkdtemp(path.join(tmpdir(), 'desktop-builder-'));
  let builds = 0;
  ipcMain.handle('project:new', () => {});
  ipcMain.handle('builder:plan', (_e, p, s, n) => inspectBuilder(p, s, n));
  ipcMain.handle('builder:folder', () => ({ root, fresh: true }));
  ipcMain.handle('builder:folder-selected', (_e, selected) => {
    assert.equal(selected, root);
  });
  ipcMain.handle('project:open', async () => {
    const opened = await readPortableStudioProject(root);
    return {
      path: path.join(root, 'clementina.yaml'),
      kind: 'portable',
      root,
      name: opened.portable.manifest.name,
      project: opened.project,
    };
  });
  ipcMain.handle('project:opened', (_e, selected, kind) => {
    assert.equal(selected, path.join(root, 'clementina.yaml'));
    assert.equal(kind, 'portable');
  });
  ipcMain.handle('project:save', async (_e, project) => {
    await writePortableStudioProject(root, project, project.builder, 'Test');
    return 'Test';
  });
  ipcMain.handle('builder:action', async (_e, action, p, s, n) => {
    assert.equal(action, 'build');
    builds++;
    const b = await buildStudioProject(root, p, s, n);
    return b.ok ? { ok: true, diagnostics: b.diagnostics, sdRoot: b.value.sdRoot } : b;
  });
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.resolve(__dirname, '../dist/apps/desktop/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(e.message);
  });
  const run = (source) => win.webContents.executeJavaScript(`(()=>{${source}})()`);
  const wait = async (condition) => {
    for (let n = 0; n < 100; n++) {
      if (await run(`return ${condition};`)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('Timeout: ' + condition);
  };
  try {
    await win.loadFile(path.resolve(__dirname, '../apps/desktop/editor.html'));
    await run(`showView('tiles');$('addBankFile').click();showView('builder');`);
    await wait(`$('buAssets').querySelectorAll('.buAsset').length>=2`);
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
    await wait(`$('buAssets').querySelector('select')!==null`);
    await run(
      `const row=$('buAssets').querySelector('.buAsset'),target=document.querySelector('[data-slot="slot1"]'),dt=new DataTransfer();dt.setData('application/clementina-asset',row.dataset.asset);target.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));`,
    );
    assert.equal(await run(`return builderSettings.include[0].slot;`), 'slot1');
    await run(`$('buFolder').click();`);
    await wait(`!$('buBuild').disabled`);
    await run(`$('buBuild').click();`);
    await wait(`!$('buBuild').disabled`);
    assert.equal(builds, 1);
    assert.match(await run(`return $('buDiagnostics').textContent;`), /No build errors/);
    // File > Open loads the portable assets into the editors; File > Save writes them back.
    await run(`dirty=false;$('nativeOpen').click();`);
    await wait(`projectFile!==null`);
    await wait(`$('buFolderPath').textContent===${JSON.stringify(root)}`);
    assert.equal(await run(`return paletteConfigs.length;`), 1);
    await run(`paletteConfigs[0].name='RoundTrip';markDirty();$('nativeSave').click();`);
    await wait(`!dirty`);
    assert.equal((await loadProject(root)).value.assets.paletteConfigs[0].name, 'RoundTrip');
    await writeFile(
      '/tmp/clementina-builder-1440.png',
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setSize(1024, 768);
    await new Promise((r) => setTimeout(r, 100));
    const bounds = await run(
      `return {width:innerWidth,scroll:document.documentElement.scrollWidth,nav:$('workflowNav').getBoundingClientRect().height,grid:getComputedStyle($('builderEditor')).display};`,
    );
    assert.equal(bounds.scroll, bounds.width);
    assert.equal(bounds.nav, 44);
    assert.equal(bounds.grid, 'grid');
    await writeFile(
      '/tmp/clementina-builder-1024.png',
      (await win.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    console.log('desktop builder: ok');
    app.exit(0);
  } catch (e) {
    console.error(e, errors);
    app.exit(1);
  }
});
