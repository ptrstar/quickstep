// PLACEHOLDER until Stage 5. It wires the core to Serial so the build shows realistic flash/RAM
// usage, but does not drive motors yet: the step ISR, our own RX ring buffer and flow control
// replace this file.
#include <Arduino.h>

#include "decoder.h"
#include "machine.h"

struct SerialSource : qs::ByteSource {
  int read() override { return Serial.read(); }
};

static SerialSource input;
static qs::Decoder decoder;
static qs::Machine machine;

void setup() {
  Serial.begin(250000);
  const uint8_t hello[] = {0xA5, 0x02, 0x04};  // SPEC §5: version 2, 64 byte buffer for now
  Serial.write(hello, sizeof hello);
}

void loop() {
  qs::Instruction ins;
  while (machine.canAccept()) {
    qs::Decoder::Status s = decoder.next(input, ins);
    if (s == qs::Decoder::Failed) {
      Serial.write(decoder.error());
      for (;;) {
      }
    }
    if (s != qs::Decoder::Ready) break;
    machine.accept(ins);
  }
  qs::Action action;
  while (machine.poll(action, Serial.available() == 0)) {
    // Stage 5: hand the action to the step generator.
  }
}
