#pragma once
#include <stdbool.h>
#define PWM_IRQ_WRAP_0 0
#define PICO_DEFAULT_IRQ_PRIORITY 0x80
static inline void irq_set_enabled(int irq, bool on) { (void)irq; (void)on; }
static inline void irq_set_priority(int irq, int priority) { (void)irq; (void)priority; }
static inline void irq_set_exclusive_handler(int irq, void (*handler)(void)) { (void)irq; (void)handler; }
