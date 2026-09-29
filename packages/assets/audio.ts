// MIA audio as Studio authors it: the voice model, instruments, songs and
// sound effects, and the engine that previews them. The compiler that turns a
// song into the MIA background sequencer's bytecode, and a sound into its
// register writes, is the external SDK's (@clementina/assets, from
// clementina-sdk): the SDK builds the game's files with the same code Studio
// previews. See docs/audio.md.
//
// This module gathers its parts, in audio/:
// - model.ts: constants, the register layout, instruments, songs and sounds;
// - engine.ts: MiaEngine, audio.c bit for bit, with its voice parts in voice.ts;
// - streams.ts: what the editors play, a sound, a note or a song;
// - presets.ts: generated sound effects.
// A preview is what the chip plays, sample for sample, before its PWM output
// stage.
//
// The renderer loads this module as it is; editor.html's import map resolves
// @clementina/assets/audio, which itself imports nothing.
export * from './audio/model.js';
export { MiaEngine } from './audio/engine.js';
export * from './audio/streams.js';
export * from './audio/presets.js';
