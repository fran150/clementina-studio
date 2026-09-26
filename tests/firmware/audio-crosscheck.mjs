// Holds Studio's audio engine to MIA's firmware: compiles clementina-mia's
// src/mia/audio/audio.c with tests/firmware/audio-harness.c, plays every
// scenario in audio-scenarios.mjs on both, and compares them sample for
// sample. Prints the hashes tests/audio.test.mjs records.
//
//   npm run test:firmware        (MIA_DIR=path/to/clementina-mia to point elsewhere)
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as audio from '../../dist/packages/assets/audio.js';
import {scenarios, runEngine, scenarioText, hash} from './audio-scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), studio = path.resolve(here, '../..');
const mia = [process.env.MIA_DIR, '../clementina-mia', '../../pico/clementina-mia'].filter(Boolean).map(p => path.resolve(studio, p)).find(p => existsSync(path.join(p, 'src/mia/audio/audio.c')));
if (!mia) { console.error('Cannot find clementina-mia; set MIA_DIR.'); process.exit(2); }
const binary = path.join(mkdtempSync(path.join(tmpdir(), 'mia-audio-')), 'audio-harness');
execFileSync('cc', ['-O2', '-std=c11', '-w', '-I', path.join(here, 'stubs'), '-I', path.join(mia, 'src/mia'), path.join(here, 'audio-harness.c'), '-o', binary, '-lm'], {stdio: 'inherit'});

let failed = false;
for (const [name, scenario] of Object.entries(scenarios(audio))) {
 const firmware = execFileSync(binary, {input: scenarioText(scenario), maxBuffer: 1 << 28}).toString().trim().split('\n').map(line => line.split(' ').map(Number));
 const studioSamples = runEngine(audio, scenario);
 const at = firmware.findIndex((pair, i) => pair[0] !== studioSamples[i]?.[0] || pair[1] !== studioSamples[i]?.[1]);
 const same = at < 0 && firmware.length === studioSamples.length;
 const heard = firmware.filter(([l, r]) => l || r).length;
 console.log(`${same ? 'same' : 'DIFFERENT'}  ${name.padEnd(8)} ${firmware.length} samples, ${heard} audible, firmware hash ${hash(firmware)}`);
 if (!same) { failed = true; console.log(`  first difference at sample ${at}: firmware ${firmware[at]}, Studio ${studioSamples[at]}`); }
}
console.log(`firmware: ${mia}`);
process.exit(failed ? 1 : 0);
