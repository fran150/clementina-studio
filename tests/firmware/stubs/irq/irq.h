#pragma once
#include <stdint.h>
#define IRQ_AUDIO_SEQ_DONE (1u << 14)
extern unsigned harness_seq_done;
static inline void mia_irq_set_flag(uint16_t flag) { if (flag & IRQ_AUDIO_SEQ_DONE) harness_seq_done++; }
