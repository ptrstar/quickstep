// Speed profile of one segment (SPEC §7). Mirrors web/src/core/sim/trapezoid.ts.
#pragma once

#include "params.h"

namespace qs {

struct Trapezoid {
  real length;
  real accel;
  real entry;
  real exit;
  real peak;  // highest speed reached: nominal, or the triangle peak
  real accelTime;
  real cruiseTime;
  real decelTime;
  real accelDist;
  real cruiseDist;

  real duration() const { return accelTime + cruiseTime + decelTime; }
};

Trapezoid trapezoid(real length, real accel, real entry, real exit, real nominal);

}  // namespace qs
