// Machine parameters (protocol/SPEC.md §6). Ids and defaults must match web/src/core/quickstep/params.ts.
#pragma once

#include <stdint.h>

namespace qs {

// float is what the AVR has (double is 32 bit there). Native builds use it too, to see the same precision.
typedef float real;

struct Params {
  real steps_per_mm_x;  // full steps per mm
  real steps_per_mm_y;
  real microsteps_x;
  real microsteps_y;
  real microsteps_z;
  real draw_speed;  // mm/s, pen down
  real travel_speed;  // mm/s, pen up
  real max_speed_x;  // mm/s
  real max_speed_y;
  real accel_x;  // mm/s²
  real accel_y;
  real junction_deviation;  // mm
  real pen_lift_steps;  // full steps
  real pen_speed;  // full steps/s
  real pen_accel;  // full steps/s²
  real pen_settle_ms;
};

void setDefaults(Params& p);

// True if `id` names a parameter. Used by the decoder to reject unknown ids.
bool isParamId(uint8_t id);

// Sets parameter `id`. Returns false for unknown ids.
bool setParam(Params& p, uint8_t id, real value);

}  // namespace qs
