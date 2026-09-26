// Stand-ins for the Pico SDK, just enough to compile clementina-mia's
// src/mia/audio/audio.c on a desktop for tests/firmware/audio-harness.c.
#pragma once
#include <stdint.h>
enum { clk_sys = 0 };
static inline uint32_t clock_get_hz(int clock) { (void)clock; return 150000000u; }
