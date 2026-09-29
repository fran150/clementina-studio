// Selection and the clipboard, the same in every editor: select, flip,
// copy, cut, paste, delete, move and select-all on background and overlay
// cells, tileset pixels, shape sprites, animation frames and palettes.
// Run with `npm run test:desktop:editing`.
const assert = require('node:assert/strict');
const { suite } = require('./harness/electron.cjs');

suite(
  'editing',
  {
    input: {
      round: true,
      clickCountOnMove: true,
      settle: { key: 50, mouseDown: 50, mouseMove: 30, mouseUp: 50, gesture: 0 },
    },
  },
  async ({ window, run, wait, key, mouse, drag, click, cells, command }) => {
    // The tile and flip of cell (col,row) of a background or overlay.
    const cell = (list, col, row, width = 40) =>
      run(`const c=${list}.cells[${row * width + col}];return {tile:c.tile,flipX:c.flipX};`);

    // Four tiles that look different, so a mirrored block is visibly mirrored.
    await run(
      `showView('tiles');$('addBankFile').click();const t=tilesets[0];for(let tile=1;tile<=4;tile++)for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,tile,x,y,(x+tile)%8);redrawAll();`,
    );

    // ---- Backgrounds ----
    await run(
      `showView('backgrounds');$('bgNewAction').click();$('bgActualSize').click();const a=backgrounds[0];a.cells[2*40+2]={...a.cells[0],tile:1};a.cells[2*40+3]={...a.cells[0],tile:2};renderBackgrounds();`,
    );
    let at = await cells('bgCanvas');
    await key('S');
    await drag([at(2, 2), at(3, 2)]);
    assert.equal(
      await run(`return $('bgSelectionLabel').textContent.slice(0,14);`),
      'Selected 2 × 1',
    );
    // A flip turns the selected block over: the tiles swap places and flip.
    await run(`$('bgFlipX').click();`);
    assert.deepEqual(
      [await cell('backgrounds[0]', 2, 2), await cell('backgrounds[0]', 3, 2)],
      [
        { tile: 2, flipX: true },
        { tile: 1, flipX: true },
      ],
      'flipping a selection must mirror the block',
    );
    await run(`$('bgUndo').click();`);
    // Copy, then paste where the pointer is; a click places it and selects it.
    await key('C', ['control']);
    await mouse('mouseMove', at(5, 5));
    await key('V', ['control']);
    await click(at(5, 5));
    assert.deepEqual(
      [(await cell('backgrounds[0]', 5, 5)).tile, (await cell('backgrounds[0]', 6, 5)).tile],
      [1, 2],
      'a paste must land where it is clicked',
    );
    assert.equal(
      await run(`return $('bgSelectionLabel').textContent.slice(0,14);`),
      'Selected 2 × 1',
      'the paste must become the selection',
    );
    // Delete clears the selection to blank cells.
    await key('Delete');
    assert.deepEqual(
      [(await cell('backgrounds[0]', 5, 5)).tile, (await cell('backgrounds[0]', 6, 5)).tile],
      [0, 0],
      'Delete must clear the selected cells',
    );
    // Dragging inside a selection moves it, as one undo step.
    await drag([at(2, 2), at(3, 2)]);
    await drag([at(2, 2), at(2, 4)]);
    assert.deepEqual(
      [
        (await cell('backgrounds[0]', 2, 4)).tile,
        (await cell('backgrounds[0]', 3, 4)).tile,
        (await cell('backgrounds[0]', 2, 2)).tile,
      ],
      [1, 2, 0],
      'dragging a selection must move its cells',
    );
    await run(`$('bgUndo').click();`);
    assert.deepEqual(
      [(await cell('backgrounds[0]', 2, 2)).tile, (await cell('backgrounds[0]', 2, 4)).tile],
      [1, 0],
      'one undo must put a moved selection back',
    );
    // Arrows nudge the selection; Ctrl/Cmd+A selects everything; Escape deselects.
    await drag([at(2, 2), at(3, 2)]);
    await key('Right');
    assert.deepEqual(
      [
        (await cell('backgrounds[0]', 3, 2)).tile,
        (await cell('backgrounds[0]', 4, 2)).tile,
        (await cell('backgrounds[0]', 2, 2)).tile,
      ],
      [1, 2, 0],
      'an arrow must nudge the selection one cell',
    );
    await key('A', ['control']);
    assert.equal(
      await run(`return $('bgSelectionLabel').textContent.slice(0,16);`),
      'Selected 40 × 25',
    );
    await key('Escape');
    assert.equal(await run(`return $('bgSelectionLabel').hidden;`), true);
    // Picking tiles on the tile map switches to the pencil, as in Tiled.
    await run(`$('bgSelectTool').click();$('bgTileLibraryToggle').click();`);
    const bgMap = await run(
      `const r=$('bgTileMap').getBoundingClientRect();return {x:r.left+r.width*(1.5/16),y:r.top+r.height*(0.5/16)};`,
    );
    await click(bgMap);
    assert.ok(
      await run(`return $('bgPencilTool').classList.contains('on');`),
      'picking a tile must switch to the pencil',
    );
    await run(`$('bgTileLibraryToggle').click();`);

    // Library rows: Duplicate from the right-click menu, Delete on a focused row.
    await run(
      `$('bgLibraryToggle').click();const r=$('bgList').children[0].getBoundingClientRect();$('bgList').children[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+5}));`,
    );
    assert.deepEqual(
      await run(
        `return [...document.querySelectorAll('.studioMenu button span')].map(s=>s.textContent);`,
      ),
      ['Rename', 'Duplicate', 'Delete'],
    );
    await run(`[...document.querySelectorAll('.studioMenu button')][1].click();`);
    assert.equal(await run(`return backgrounds.length;`), 2, 'the row menu must duplicate');
    await run(`$('bgList').children[1].focus();`);
    await key('Delete');
    assert.equal(
      await run(`return backgrounds.length;`),
      1,
      'Delete on a focused row must delete that item',
    );
    assert.equal(
      await run(`return $('status').textContent.includes('Ctrl/Cmd+Z brings it back');`),
      true,
      'a delete must say how to undo it',
    );
    await run(`$('bgLibraryToggle').click();`);
    // The shortcut sheet lists the keys for the editor on screen.
    await key('/', ['control']);
    assert.deepEqual(
      await run(
        `return {open:$('shortcutHelp').open,editor:[...$('shortcutHelp').querySelectorAll('h3')].map(h=>h.textContent)};`,
      ),
      { open: true, editor: ['Everywhere', 'Backgrounds'] },
    );
    await key('Escape');
    assert.equal(await run(`return $('shortcutHelp').open;`), false);

    // ---- Overlays: the same Select tool, and cells paste across editors ----
    await run(`showView('overlays');$('ovNewAction').click();$('ovActualSize').click();`);
    at = await cells('ovCanvas');
    await key('S');
    assert.ok(
      await run(`return $('ovSelectTool').classList.contains('on');`),
      'S must pick the overlay Select tool',
    );
    await mouse('mouseMove', at(10, 10));
    await key('V', ['control']);
    await click(at(10, 10));
    assert.deepEqual(
      [(await cell('overlays[0]', 10, 10)).tile, (await cell('overlays[0]', 11, 10)).tile],
      [1, 2],
      'cells copied in a background must paste into an overlay',
    );
    await key('X', ['control']);
    assert.equal((await cell('overlays[0]', 10, 10)).tile, 0, 'Cut must clear the selected cells');
    // The selection belongs to the Select tool: taking up the pencil drops it.
    await key('B');
    assert.equal(
      await run(`return $('ovSelectionLabel').hidden;`),
      true,
      'switching to a painting tool must drop the selection',
    );
    // A dragged group on the tile map stamps whole; a flipped group is mirrored.
    await run(`$('ovTileLibraryToggle').click();`);
    const ovMap = await run(
      `const r=$('ovTileMap').getBoundingClientRect(),c=r.width/16;return {from:{x:r.left+c*1.5,y:r.top+c*0.5},to:{x:r.left+c*2.5,y:r.top+c*0.5}};`,
    );
    await drag([ovMap.from, ovMap.to]);
    assert.deepEqual(
      await run(
        `return {pencil:$('ovPencilTool').classList.contains('on'),group:$('ovGroupLabel').textContent.slice(0,11)};`,
      ),
      { pencil: true, group: 'Group 2 × 1' },
    );
    await run(`$('ovTileLibraryToggle').click();$('ovFlipX').click();`);
    at = await cells('ovCanvas');
    await click(at(20, 20));
    assert.deepEqual(
      [await cell('overlays[0]', 20, 20), await cell('overlays[0]', 21, 20)],
      [
        { tile: 2, flipX: true },
        { tile: 1, flipX: true },
      ],
      'a flipped group must stamp mirrored',
    );

    // ---- Tileset pixels ----
    // The canvas shows the tiles picked on the tile map: tile 0 by default.
    await run(`showView('tiles');setTilePixel(tilesets[0],0,3,0,5);renderBankEditor();`);
    await key('A', ['control']);
    const pixel = `return tilePixel(tilesets[0],0,3,0);`;
    const before = await run(pixel);
    await key('X', ['control']);
    assert.equal(await run(pixel), 0, 'Cut must clear the selected pixels');
    await key('Z', ['control']);
    assert.equal(await run(pixel), before);
    await key('Delete');
    assert.equal(await run(pixel), 0, 'Delete must clear the selected pixels');
    await key('Z', ['control']);

    // ---- Shapes ----
    await run(
      `showView('shapes');$('scNew').click();shapes[0].sprites=[{tile:1,x:0,y:0,paletteBank:0,flipX:false,flipY:false}];renderAnimations();`,
    );
    await key('A', ['control']);
    await key('C', ['control']);
    await key('V', ['control']);
    assert.deepEqual(
      await run(`return shapes[0].sprites.map(p=>[p.tile,p.x,p.y]);`),
      [
        [1, 0, 0],
        [1, 0, 0],
      ],
      'a sprite paste must land where it was copied from',
    );
    await key('D', ['control']);
    assert.deepEqual(
      await run(`return shapes[0].sprites.at(-1);`),
      { tile: 1, x: 8, y: 8, paletteBank: 0, flipX: false, flipY: false },
      'Duplicate must offset the copy one tile',
    );
    await key('X', ['control']);
    assert.equal(
      await run(`return shapes[0].sprites.length;`),
      2,
      'Cut must remove the selected sprites',
    );
    // Edit ▸ Copy and Paste, clicked in the menu, run the same commands.
    await key('A', ['control']);
    window.webContents.copy();
    await wait(80);
    window.webContents.paste();
    await wait(80);
    assert.equal(
      await run(`return shapes[0].sprites.length;`),
      4,
      "the Edit menu's Copy and Paste must copy and paste sprites",
    );
    await key('Z', ['control']);
    // Picking tiles in the tile picker switches to Place tiles.
    await run(`$('scTileLibraryToggle').click();`);
    const scMap = await run(
      `const r=$('scBankMap').getBoundingClientRect();return {x:r.left+r.width*(1.5/16),y:r.top+r.height*(0.5/16)};`,
    );
    await click(scMap);
    assert.ok(
      await run(`return $('scPlace').classList.contains('on');`),
      'picking tiles must switch to Place tiles',
    );
    await key('Escape');
    await run(`$('scTileLibraryToggle').click();`);
    // A clipboard holds one kind of thing: sprites do not paste into a background.
    await run(`showView('backgrounds');`);
    const bgCells = await run(`return JSON.stringify(backgrounds[0].cells);`);
    await key('V', ['control']);
    assert.equal(
      await run(`return JSON.stringify(backgrounds[0].cells);`),
      bgCells,
      'sprites must not paste into a background',
    );

    // ---- Animations ----
    await run(`showView('animations');$('anNew').click();`);
    await key('C', ['control']);
    await key('V', ['control']);
    assert.equal(
      await run(`return animations[0].frames.length;`),
      2,
      'a frame paste must add a frame',
    );
    await key('Left');
    assert.equal(
      await run(`return frameIndex;`),
      0,
      'the left arrow must step to the previous frame',
    );
    await key('Delete');
    assert.equal(
      await run(`return animations[0].frames.length;`),
      1,
      'Delete must remove the selected frame',
    );
    await key('Space');
    await wait(80);
    assert.equal(await run(`return playing;`), true, 'Space must play');
    await key('Space');
    assert.equal(await run(`return playing;`), false, 'Space must pause');

    // ---- Palettes ----
    await run(`showView('palettes');$('palList').children[0].click();`);
    await key('C', ['control']);
    await run(`$('palList').children[1].click();`);
    await key('V', ['control']);
    assert.equal(
      await run(
        `return JSON.stringify(paletteLibrary[1].colors)===JSON.stringify(paletteLibrary[0].colors);`,
      ),
      true,
      'a palette paste must copy every color',
    );
    // Edit ▸ Undo, through the menu's command.
    await command('undo', { settle: 80 });
    assert.equal(
      await run(
        `return JSON.stringify(paletteLibrary[1].colors)===JSON.stringify(paletteLibrary[0].colors);`,
      ),
      false,
      'a palette paste must undo',
    );
    // One history for the project: undo reaches back past the palette paste to
    // the last animation edit, in another editor.
    const frames = await run(`return animations[0].frames.length;`);
    await key('Z', ['control']);
    assert.equal(
      await run(`return animations[0].frames.length;`),
      frames + 1,
      'undo must reach edits made in other editors',
    );
  },
);
