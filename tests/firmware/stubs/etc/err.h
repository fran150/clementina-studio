#pragma once
#include <stdint.h>
#define ERROR_DEFER_AUDIO_QUEUE_OVERFLOW (1u << 1)
static inline void error_defer(uint32_t flags) { (void)flags; }
