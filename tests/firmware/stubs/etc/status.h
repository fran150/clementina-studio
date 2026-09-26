#pragma once
#include <stdint.h>
#define MIA_STAT_AUDIO_ACTIVE (1u << 8)
static inline void mia_status_set_flag(uint16_t flag) { (void)flag; }
static inline void mia_status_clear_flag(uint16_t flag) { (void)flag; }
