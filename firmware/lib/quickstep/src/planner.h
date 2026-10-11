// Lookahead planner (SPEC §7). Mirrors web/src/core/sim/planner.ts.
//
// Segments are queued as they are decoded. When a segment starts executing it is removed from the
// queue and its profile is frozen, using the segments still queued behind it as lookahead.
#pragma once

#include <stdint.h>

#include "params.h"
#include "trapezoid.h"

namespace qs {

const uint8_t LOOKAHEAD = 20;

struct Segment {
  int16_t dx, dy;  // full steps, for the step generator
  real length;  // mm
  real nominal;  // mm/s
  real accel;  // mm/s²
  real junction;  // speed limit at the start of this segment, mm/s (0 at the start of a run)
};

class Planner {
 public:
  Planner() { reset(); }

  // Empties the queue. The next segment starts a new run from rest.
  void reset();

  bool full() const { return count_ == LOOKAHEAD; }
  bool empty() const { return count_ == 0; }
  uint8_t size() const { return count_; }

  // Queues a move of (dx, dy) full steps. Zero-length moves are ignored. Must not be called when full.
  void push(int16_t dx, int16_t dy, bool penDown, const Params& p);

  // Removes the oldest segment and freezes its profile. The queued segments are its lookahead;
  // the last one ends at rest. Must not be called when empty.
  Segment pop(Trapezoid& profile);

  // Call at a barrier, once the queue is empty: the next segment starts from rest.
  void endRun() {
    lastValid_ = false;
    entry_ = 0;
  }

 private:
  Segment& at(uint8_t i) { return queue_[(head_ + i) % LOOKAHEAD]; }

  Segment queue_[LOOKAHEAD];
  uint8_t head_;
  uint8_t count_;
  real entry_;  // frozen exit speed of the last popped segment
  // direction and limits of the last pushed segment, for the next junction
  bool lastValid_;
  real lastUx_, lastUy_, lastNominal_, lastAccel_;
};

}  // namespace qs
