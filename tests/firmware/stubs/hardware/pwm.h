#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef volatile uint32_t io_rw_32;
typedef struct { uint32_t wrap; } pwm_config;
// The PWM registers audio.c writes directly. The harness reads each output
// channel's compare level from here: that is the chip's output.
typedef struct { io_rw_32 csr, div, ctr, cc, top; } pwm_slice_hw_t;
typedef struct { pwm_slice_hw_t slice[12]; io_rw_32 en, intr; } pwm_hw_t;
extern pwm_hw_t harness_pwm;
#define pwm_hw (&harness_pwm)
static inline void hw_write_masked(io_rw_32 *addr, uint32_t values, uint32_t mask) { *addr = (*addr & ~mask) | (values & mask); }
static inline unsigned pwm_gpio_to_slice_num(unsigned gpio) { return (gpio >> 1) & 7u; }
static inline unsigned pwm_gpio_to_channel(unsigned gpio) { return gpio & 1u; }
static inline pwm_config pwm_get_default_config(void) { pwm_config c = {0}; return c; }
static inline void pwm_config_set_wrap(pwm_config *c, uint32_t wrap) { c->wrap = wrap; }
static inline void pwm_init(unsigned slice, pwm_config *c, bool start) { (void)slice; (void)c; (void)start; }
static inline void pwm_set_wrap(unsigned slice, uint32_t wrap) { pwm_hw->slice[slice].top = wrap; }
static inline void pwm_clear_irq(unsigned slice) { (void)slice; }
static inline void pwm_set_irq_enabled(unsigned slice, bool on) { (void)slice; (void)on; }
static inline void pwm_set_chan_level(unsigned slice, unsigned channel, uint16_t level) {
    unsigned shift = channel ? 16u : 0u;
    hw_write_masked(&pwm_hw->slice[slice].cc, (uint32_t)level << shift, 0xFFFFu << shift);
}
