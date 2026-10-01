// Shared shell behavior, exercised in the real Electron renderer.
const assert = require('node:assert/strict');
const { suite } = require('./harness/electron.cjs');

suite(
  'shell',
  {
    // Report the thrown error and the renderer's errors separately.
    onFailure: (error, errors) => {
      console.error(error);
      console.error(errors);
    },
  },
  async ({ run }) => {
    for (const view of [
      'palettes',
      'tiles',
      'overlays',
      'backgrounds',
      'shapes',
      'animations',
      'sounds',
      'music',
    ]) {
      const state = await run(
        `showView('${view}');return {current:document.querySelector('[aria-current="page"]')?.dataset.view,nav:Math.round($('workflowNav').getBoundingClientRect().height),header:Math.round(document.querySelector('header').getBoundingClientRect().height),fileActionsInTabs:!!$('nativeSave').closest('#workflowNav'),currentTabMarked:getComputedStyle(document.querySelector('[aria-current="page"]')).boxShadow.includes('inset'),status:document.querySelector('#status').getAttribute('role'),tooltips:document.querySelectorAll('#studioTooltip').length};`,
      );
      // The file actions moved into the tab bar; the row below the tabs is gone.
      assert.deepEqual(state, {
        current: view,
        nav: 44,
        header: 0,
        fileActionsInTabs: true,
        currentTabMarked: true,
        status: 'status',
        tooltips: 1,
      });
    }
    // An asset's own docks wait for an asset: their buttons are disabled while the editor is empty.
    assert.deepEqual(
      await run(
        `showView('animations');return ['anShapeLibraryToggle','anFramePanelToggle','anLibraryToggle'].map(id=>$(id).disabled);`,
      ),
      [true, true, false],
    );
    await run(
      `showView('tiles');$('addBankFile').click();showView('shapes');$('scNew').click();showView('animations');$('anNew').click();showView('overlays');$('ovNewAction').click();`,
    );
    for (const [view, first, second] of [
      ['animations', 'anLibraryToggle', 'anShapeLibraryToggle'],
      ['shapes', 'scLibraryToggle', 'scTileLibraryToggle'],
      ['overlays', 'ovLibraryToggle', 'ovTileLibraryToggle'],
    ]) {
      const states = await run(
        `showView('${view}');const a=$('${first}'),b=$('${second}');a.click();b.click();const panel=$(b.getAttribute('aria-controls'));const state={first:a.getAttribute('aria-expanded'),second:b.getAttribute('aria-expanded'),hidden:panel.hidden};panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return {...state,closed:panel.hidden,expanded:b.getAttribute('aria-expanded'),focus:document.activeElement.id};`,
      );
      assert.deepEqual(states, {
        first: 'false',
        second: 'true',
        hidden: false,
        closed: true,
        expanded: 'false',
        focus: second,
      });
    }
    const independent = await run(
      `showView('palettes');const a=$('palLibraryToggle'),b=$('palConfigsToggle');if(a.getAttribute('aria-expanded')==='false')a.click();if(b.getAttribute('aria-expanded')==='false')b.click();$('palClose').click();return {closed:$('palLibrary').hidden,other:$('palConfigs').hidden,focus:document.activeElement.id};`,
    );
    assert.deepEqual(independent, { closed: true, other: false, focus: 'palLibraryToggle' });
    const roundTrip = await run(
      `const before=JSON.stringify(studioProject());for(const view of ['tiles','animations','palettes','shapes'])showView(view);return before===JSON.stringify(studioProject());`,
    );
    assert.equal(roundTrip, true, 'view changes must not mutate project assets');
  },
);
