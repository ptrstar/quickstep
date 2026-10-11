// Serial link (SPEC §5): interrupt-driven receive into our own ring buffer, flow-control credits,
// and blocking single-byte replies. Replaces Arduino's Serial, which must not be used.
#pragma once

#include <stdint.h>

#include "decoder.h"

namespace uart {

// Usable receive buffer. Announced to the host as RX_SIZE / 16.
const uint8_t RX_SIZE = 255;

void init();
void write(uint8_t b);
bool empty();
bool overrun();

// Reports freed buffer space to the host. Call regularly from the main loop.
void service();

// The decoder's byte source.
struct Source : qs::ByteSource {
  int read() override;
};

}  // namespace uart
