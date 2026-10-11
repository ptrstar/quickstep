// Cuts actions into short slices for the step interrupt.
//
// The planner's profiles are continuous (mm, mm/s). The step interrupt only does integer work, so
// the main loop cuts each profile into slices of about 5 ms. Within a slice the speed is constant:
// "N events, one every P timer ticks". An event is one Bresenham step of the dominant axis, or a
// pause when the slice has no steps (dwell, pen settle, slow starts).
#pragma once

#include <stdint.h>

#include "machine.h"
#include "params.h"
#include "trapezoid.h"

namespace qs {

// Timer1 at 16 MHz with prescaler 8.
const uint32_t TICKS_PER_SECOND = 2000000;
const uint16_t SLICE_TICKS = 10000;  // 5 ms
// Shortest step period: 40 µs, i.e. at most 25 000 steps/s on the dominant axis.
const uint16_t MIN_PERIOD = 80;

enum SliceFlags : uint8_t {
  SLICE_NEW_MOVE = 1,  // load counts and directions before the first event
  SLICE_NO_STEP = 2,  // events only take time
  SLICE_MOTORS_OFF = 4,  // disable the drivers at the event
};

enum Dirs : uint8_t { DIR_X_POS = 1, DIR_Y_POS = 2, DIR_Z_DOWN = 4 };

struct Slice {
  uint16_t period;  // timer ticks between events
  uint16_t events;  // at least 1
  uint8_t flags;
  uint8_t dirs;  // NEW_MOVE only
  uint32_t cx, cy, cz;  // NEW_MOVE only: microsteps per axis for the whole move
  uint32_t major;  // NEW_MOVE only: max(cx, cy, cz), Bresenham events for the whole move
};

class Slicer {
 public:
  Slicer() : mode_(IDLE) {}

  // True while the current action still has slices to give.
  bool busy() const { return mode_ != IDLE; }

  // Starts slicing an action. Pause and End produce no slices.
  void begin(const Action& a, const Params& p);

  // Next slice of the current action. False when it is finished.
  bool next(Slice& out);

 private:
  enum Mode : uint8_t { IDLE, MOTION, WAIT, MOTORS_OFF };

  bool nextMotion(Slice& out);

  Mode mode_;
  Trapezoid profile_;
  real t_;  // seconds of the profile already sliced
  uint32_t done_;  // events already sliced
  uint32_t cx_, cy_, cz_, major_;
  uint8_t dirs_;
  bool first_;  // the next slice must carry SLICE_NEW_MOVE
  uint32_t waitTicks_;  // after the motion (pen settle) or on its own (dwell)
};

}  // namespace qs
