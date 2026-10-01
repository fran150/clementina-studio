// User journey: no injected assets, direct handlers, or synthetic DOM clicks.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { suite } = require('./harness/electron.cjs');

// Screenshots, and on failure the error, land here.
const artifacts = process.env.STUDIO_CAPTURE_DIR || path.resolve('test-results');

// Writes one file into the artifacts folder, creating the folder if needed.
function saveArtifact(name, data) {
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(artifacts, name), data);
}

suite(
  'workflow',
  {
    width: 1024,
    height: 900,
    webPreferences: { backgroundThrottling: false },
    timeout: 45000,
    onSuccess: async ({ png }) => saveArtifact('workflow-success.png', await png()),
    onFailure: async (error, errors, studio) => {
      console.error(error, errors);
      saveArtifact('workflow-failure.png', await studio.png());
      saveArtifact('workflow-failure.txt', String(error.stack) + '\n' + errors.join('\n'));
    },
  },
  async ({ read, until, clickElement, expectValidProject }) => {
    await clickElement('[data-view="animations"]');
    await clickElement('#anLibraryToggle');
    await clickElement('#anNew');
    await until(
      `document.querySelector('#anEmptyMessage')?.checkVisibility() && document.querySelector('#anEmptyMessage').textContent.includes('Create a shape first')`,
    );
    assert.equal(await read(`document.querySelector('#anAnimList').children.length`), 0);
    await clickElement('#anCreateShape');
    await until(`document.querySelector('#scNew').checkVisibility()`);
    // Create the source tileset, then the shape, using the same controls as a user.
    await clickElement('[data-view="tiles"]');
    await clickElement('#emptyNew');
    await clickElement('[data-view="shapes"]');
    await clickElement('#scNew');
    await until(`document.querySelector('#scSprites').children.length === 1`);
    await clickElement('[data-view="animations"]');
    await clickElement('#anNew');
    await until(`document.querySelector('#anGroupTitle').textContent === 'animation_1'`);
    assert.equal(await read(`document.querySelector('#anEmpty').hidden`), true);
    assert.equal(await read(`document.querySelector('#anTimeline').children.length`), 1);
    await clickElement('#anDuplicateFrame');
    await until(`document.querySelector('#anTimeline').children.length === 2`);
    await clickElement('#anUndo');
    await until(`document.querySelector('#anTimeline').children.length === 1`);
    await clickElement('#anRedo');
    await until(`document.querySelector('#anTimeline').children.length === 2`);
    await clickElement('#anPlay');
    await until(`document.querySelector('#anPlay').getAttribute('aria-pressed') === 'true'`);
    await clickElement('#anPlay');
    await until(`document.querySelector('#anPlay').getAttribute('aria-pressed') === 'false'`);
    await clickElement('#anNew');
    await until(`document.querySelector('#anGroupTitle').textContent === 'animation_2'`);
    assert.equal(await read(`document.querySelector('#anAnimList').children.length`), 2);
    await expectValidProject();
  },
);
