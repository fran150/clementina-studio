#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef struct { uint32_t wrap; } pwm_config;
static inline unsigned pwm_gpio_to_slice_num(unsigned gpio) { return (gpio >> 1) & 7u; }
static inline unsigned pwm_gpio_to_channel(unsigned gpio) { return gpio & 1u; }
static inline pwm_config pwm_get_default_config(void) { pwm_config c = {0}; return c; }
static inline void pwm_config_set_wrap(pwm_config *c, uint32_t wrap) { c->wrap = wrap; }
static inline void pwm_init(unsigned slice, pwm_config *c, bool start) { (void)slice; (void)c; (void)start; }
static inline void pwm_set_wrap(unsigned slice, uint32_t wrap) { (void)slice; (void)wrap; }
static inline void pwm_clear_irq(unsigned slice) { (void)slice; }
static inline void pwm_set_irq_enabled(unsigned slice, bool on) { (void)slice; (void)on; }
// The harness reads each channel's last level: that is the chip's output.
extern uint16_t harness_level[2];
static inline void pwm_set_chan_level(unsigned slice, unsigned channel, uint16_t level) { (void)slice; harness_level[channel & 1u] = level; }
