// QuickStep firmware main loop (SPEC §5, §7).
//
//   serial RX ISR → ring buffer → decoder → machine (lookahead planner) → slicer → slice queue
//   → Timer1 step ISR
//
// The main loop only ever does the float work (planning, slicing); both ISRs are integer-only.
#include <Arduino.h>

#include "decoder.h"
#include "machine.h"
#include "slicer.h"
#include "stepper.h"
#include "uart.h"

namespace {
uart::Source input;
qs::Decoder decoder;
qs::Machine machine;
qs::Slicer slicer;
bool failed = false;

// SPEC §5: stop motion, report once, ignore everything until reset.
void fail(uint8_t code) {
  stepper::stop();
  uart::write(code);
  failed = true;
}
}  // namespace

void setup() {
  stepper::init();
  uart::init();
  uart::write(0xA5);  // hello: protocol version, buffer size / 16
  uart::write(0x02);
  uart::write(uart::RX_SIZE / 16);
}

void loop() {
  if (failed) return;
  if (uart::overrun()) return fail(qs::ERR_RX_OVERRUN);

  // Decode while the planner has room.
  qs::Instruction ins;
  while (machine.canAccept()) {
    qs::Decoder::Status s = decoder.next(input, ins);
    if (s == qs::Decoder::Failed) return fail(decoder.error());
    if (s != qs::Decoder::Ready) break;
    machine.accept(ins);
  }

  // Normally a segment is frozen only once the full lookahead is queued. If no more bytes are
  // coming and the motion is about to run dry, let the queued segments go anyway.
  qs::SliceQueue& slices = stepper::queue();
  bool starved = uart::empty() && slices.size() < 2;
  qs::Action action;
  if (!slicer.busy() && machine.poll(action, starved)) slicer.begin(action, machine.params());

  qs::Slice slice;
  while (!slices.full() && slicer.next(slice)) slices.push(slice);

  uart::service();
}
