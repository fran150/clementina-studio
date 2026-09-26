#pragma once
#include <stdint.h>
typedef struct { uint32_t current_addr, default_addr, limit_addr; uint8_t step, flags, reserved; } index_t;
enum { IDX_FLAG_R_STP_ENA, IDX_FLAG_W_STP_ENA, IDX_FLAG_WRAP_ENA };
extern volatile index_t idx[256];
