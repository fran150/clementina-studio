// Runs clementina-mia's real src/mia/audio/audio.c on a desktop, driven by a
// scenario on stdin, and prints every output sample as the chip's PWM levels.
// tests/firmware/audio-crosscheck.mjs compiles it against the firmware
// checkout and compares it with Studio's engine (packages/assets/audio.ts).
//
// Scenario lines, one command each:
//   w <voice> <field> <value>   a program's write to a voice register
//   m <value>                   a write to AUDIO_VOLUME
//   track <voice> <hex bytes>   bytes at the voice's track base, then AUDIO_SEQ_LOAD
//   start|stop|take|give <mask> AUDIO_SEQ_START / SEQ_STOP / VOICE_TAKE / VOICE_RELEASE
//   run <samples>               that many audio interrupts
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "audio/audio.c"

static uint8_t ram[256 * 1024];
uint8_t *mem = ram;
volatile index_t idx[256];
uint16_t harness_level[2];
unsigned harness_seq_done;

int main(void) {
    char line[1 << 16];
    mia_audio_init();
    mia_audio_enable();
    while (fgets(line, sizeof line, stdin)) {
        char cmd[16];
        if (sscanf(line, "%15s", cmd) != 1) continue;
        if (!strcmp(cmd, "w")) {
            unsigned voice, field, value;
            sscanf(line + 1, "%u %u %u", &voice, &field, &value);
            uint32_t offset = MIA_AUDIO_VOICE_OFFSET(voice) + field;
            mem[offset] = (uint8_t)value;
            mia_audio_core1_on_write(offset, (uint8_t)value);
        } else if (!strcmp(cmd, "m")) {
            unsigned value;
            sscanf(line + 1, "%u", &value);
            uint32_t offset = MIA_AUDIO_HEADER_OFFSET + MIA_AUDIO_HEADER_VOLUME;
            mem[offset] = (uint8_t)value;
            mia_audio_core1_on_write(offset, (uint8_t)value);
        } else if (!strcmp(cmd, "track")) {
            unsigned voice;
            int used;
            sscanf(line + 5, "%u%n", &voice, &used);
            const char *hex = line + 5 + used;
            uint32_t at = MIA_SEQ_DEFAULT_BASE(voice);
            unsigned byte;
            int n;
            while (sscanf(hex, "%2x%n", &byte, &n) == 1) { mem[at++] = (uint8_t)byte; hex += n; }
            mia_audio_seq_load_track((uint8_t)voice);
        } else if (!strcmp(cmd, "start") || !strcmp(cmd, "stop") || !strcmp(cmd, "take") || !strcmp(cmd, "give")) {
            unsigned mask;
            sscanf(line + strlen(cmd), "%u", &mask);
            if (!strcmp(cmd, "start")) mia_audio_seq_start((uint8_t)mask);
            if (!strcmp(cmd, "stop")) mia_audio_seq_stop((uint8_t)mask);
            if (!strcmp(cmd, "take")) mia_audio_voice_take((uint8_t)mask);
            if (!strcmp(cmd, "give")) mia_audio_voice_release((uint8_t)mask);
        } else if (!strcmp(cmd, "run")) {
            unsigned count;
            sscanf(line + 3, "%u", &count);
            for (unsigned i = 0; i < count; i++) {
                audio_irq_handler();
                printf("%d %d\n", (int)harness_level[0] - (int)AUDIO_PWM_CENTER, (int)harness_level[1] - (int)AUDIO_PWM_CENTER);
            }
        }
    }
    fprintf(stderr, "tracks finished: %u\n", harness_seq_done);
    return 0;
}
