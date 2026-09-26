#pragma once
#include <stdint.h>
#define MIA_RAM_SIZE (256 * 1024)
#define MIA_RAM_MASK (MIA_RAM_SIZE - 1)
extern uint8_t *mem;
