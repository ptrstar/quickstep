#include "trapezoid.h"

#include <math.h>

namespace qs {

static real max0(real v) { return v > 0 ? v : 0; }

Trapezoid trapezoid(real length, real accel, real entry, real exit, real nominal) {
  Trapezoid t;
  t.length = length;
  t.accel = accel;
  t.entry = entry;
  t.exit = exit;
  t.peak = nominal;
  real accelDist = (nominal * nominal - entry * entry) / (2 * accel);
  real decelDist = (nominal * nominal - exit * exit) / (2 * accel);
  if (accelDist + decelDist > length) {
    // Triangle: meet where the acceleration and deceleration ramps cross.
    t.peak = sqrtf((2 * accel * length + entry * entry + exit * exit) / 2);
    accelDist = max0((t.peak * t.peak - entry * entry) / (2 * accel));
    decelDist = max0(length - accelDist);
  }
  t.accelDist = accelDist;
  t.cruiseDist = max0(length - accelDist - decelDist);
  t.accelTime = (t.peak - entry) / accel;
  t.decelTime = (t.peak - exit) / accel;
  t.cruiseTime = t.peak > 0 ? t.cruiseDist / t.peak : 0;
  return t;
}

}  // namespace qs
