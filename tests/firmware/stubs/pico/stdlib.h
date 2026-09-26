#pragma once
#include <stdint.h>
#define __isr
#define __time_critical_func(name) name
#define __not_in_flash_func(name) name
#define __force_inline
enum { GPIO_DRIVE_STRENGTH_2MA, GPIO_SLEW_RATE_SLOW, GPIO_FUNC_PWM };
static inline void gpio_set_drive_strength(unsigned gpio, int s) { (void)gpio; (void)s; }
static inline void gpio_set_slew_rate(unsigned gpio, int s) { (void)gpio; (void)s; }
static inline void gpio_disable_pulls(unsigned gpio) { (void)gpio; }
static inline void gpio_set_function(unsigned gpio, int f) { (void)gpio; (void)f; }
