// Turns decoded instructions into actions for the step generator. Mirrors web/src/core/sim/simulate.ts.
//
// Main loop:  while (machine.canAccept() && decoder gives an instruction) machine.accept(ins);
//             while (there is room for an action && machine.poll(action, starved)) hand it over;
// `starved` lets queued segments go before the lookahead is full, e.g. when no more bytes arrive.
#pragma once

#include <stdint.h>

#include "decoder.h"
#include "params.h"
#include "planner.h"
#include "trapezoid.h"

namespace qs {

struct Action {
  enum Kind : uint8_t { Move, Pen, Dwell, Pause, MotorsOff, End };
  Kind kind;
  bool penDown;  // Move: pen state while moving. Pen: state after the toggle.
  uint16_t ms;  // Dwell, and the settle time after a Pen move
  Segment segment;  // Move
  Trapezoid profile;  // Move: mm and mm/s. Pen: Z full steps and steps/s.
};

class Machine {
 public:
  Machine() { reset(); }

  // Defaults, pen up, nothing queued.
  void reset();

  bool canAccept() const { return !barrier_ && !planner_.full(); }
  void accept(const Instruction& ins);

  // Produces the next action, if one is ready. Returns false when it needs more instructions.
  bool poll(Action& out, bool starved = false);

  const Params& params() const { return params_; }
  bool penDown() const { return penDown_; }

 private:
  Params params_;
  Planner planner_;
  bool penDown_;
  bool barrier_;  // a barrier instruction waits for the queue to drain
  Instruction pending_;
};

}  // namespace qs
