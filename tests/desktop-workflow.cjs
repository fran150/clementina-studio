// User journey: no injected assets, direct handlers, or synthetic DOM clicks.
const {app, BrowserWindow, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const artifacts = process.env.STUDIO_CAPTURE_DIR || path.resolve('test-results');
const timeout = setTimeout(() => { console.error('UI workflow timed out'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  ipcMain.handle('project:new', () => {});
  const window = new BrowserWindow({show:false, width:1024, height:900, webPreferences:{
    preload:path.resolve(__dirname, '../dist/apps/desktop/preload.cjs'),
    contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false,
  }});
  const errors = [];
  window.webContents.on('console-message', event => { if(event.level === 'error') errors.push(event.message); });
  window.webContents.on('render-process-gone', (_, details) => errors.push(JSON.stringify(details)));
  const read = expression => window.webContents.executeJavaScript(expression);
  async function waitFor(expression) {
    const deadline = Date.now() + 4000;
    while(Date.now() < deadline) {
      if(await read(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Timed out waiting for ${expression}`);
  }
  async function click(selector) {
    const point = await read(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if(!el || el.disabled || !el.checkVisibility()) throw new Error('Not clickable: ' + ${JSON.stringify(selector)});
      const r = el.getBoundingClientRect(), x = Math.round(r.left + r.width/2), y = Math.round(r.top + r.height/2);
      if(!el.contains(document.elementFromPoint(x,y))) throw new Error('Covered or offscreen: ' + ${JSON.stringify(selector)});
      return {x,y};
    })()`);
    window.webContents.sendInputEvent({type:'mouseDown', ...point, button:'left', clickCount:1});
    window.webContents.sendInputEvent({type:'mouseUp', ...point, button:'left', clickCount:1});
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  try {
    await window.loadFile(path.resolve(__dirname, '../apps/desktop/editor.html'));
    await click('[data-view="animations"]');
    await click('#anLibraryToggle');
    await click('#anNew');
    await waitFor(`document.querySelector('#anEmptyMessage')?.checkVisibility() && document.querySelector('#anEmptyMessage').textContent.includes('Create a shape first')`);
    assert.equal(await read(`document.querySelector('#anAnimList').children.length`), 0);
    await click('#anCreateShape');
    await waitFor(`document.querySelector('#scNew').checkVisibility()`);
    // Create the source tileset, then the shape, using the same controls as a user.
    await click('[data-view="tiles"]');
    await click('#emptyNew');
    await click('[data-view="shapes"]');
    await click('#scNew');
    await waitFor(`document.querySelector('#scSprites').children.length === 1`);
    await click('[data-view="animations"]');
    await click('#anNew');
    await waitFor(`document.querySelector('#anGroupTitle').textContent === 'animation_1'`);
    assert.equal(await read(`document.querySelector('#anEmpty').hidden`), true);
    assert.equal(await read(`document.querySelector('#anTimeline').children.length`), 1);
    await click('#anDuplicateFrame');
    await waitFor(`document.querySelector('#anTimeline').children.length === 2`);
    await click('#anUndo');
    await waitFor(`document.querySelector('#anTimeline').children.length === 1`);
    await click('#anRedo');
    await waitFor(`document.querySelector('#anTimeline').children.length === 2`);
    await click('#anPlay');
    await waitFor(`document.querySelector('#anPlay').textContent === 'Pause'`);
    await click('#anPlay');
    await waitFor(`document.querySelector('#anPlay').textContent === 'Play'`);
    await click('#anNew');
    await waitFor(`document.querySelector('#anGroupTitle').textContent === 'animation_2'`);
    assert.equal(await read(`document.querySelector('#anAnimList').children.length`), 2);
    const {validateProject} = await import('../dist/packages/assets/index.js');
    validateProject(await read('studioProject()'));
    assert.deepEqual(errors, []);
    fs.mkdirSync(artifacts, {recursive:true});
    fs.writeFileSync(path.join(artifacts, 'workflow-success.png'), (await window.webContents.capturePage()).toPNG());
    console.log('desktop workflow: ok');
    clearTimeout(timeout); app.exit(0);
  } catch(error) {
    console.error(error, errors);
    fs.mkdirSync(artifacts, {recursive:true});
    fs.writeFileSync(path.join(artifacts, 'workflow-failure.png'), (await window.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(artifacts, 'workflow-failure.txt'), String(error.stack) + '\n' + errors.join('\n'));
    clearTimeout(timeout); app.exit(1);
  }
});
