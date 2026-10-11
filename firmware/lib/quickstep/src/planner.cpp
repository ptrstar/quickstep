#include "planner.h"

#include <math.h>

namespace qs {

static real minr(real a, real b) { return a < b ? a : b; }
static real absr(real v) { return v < 0 ? -v : v; }

void Planner::reset() {
  head_ = 0;
  count_ = 0;
  endRun();
}

void Planner::push(int16_t dx, int16_t dy, bool penDown, const Params& p) {
  real mx = dx / p.steps_per_mm_x;
  real my = dy / p.steps_per_mm_y;
  real length = sqrtf(mx * mx + my * my);
  if (length == 0) return;
  real ux = mx / length;
  real uy = my / length;

  // Speed and acceleration along the segment, limited so no axis exceeds its own limits.
  real nominal = penDown ? p.draw_speed : p.travel_speed;
  real accel = INFINITY;
  if (ux != 0) {
    nominal = minr(nominal, p.max_speed_x / absr(ux));
    accel = minr(accel, p.accel_x / absr(ux));
  }
  if (uy != 0) {
    nominal = minr(nominal, p.max_speed_y / absr(uy));
    accel = minr(accel, p.accel_y / absr(uy));
  }

  // Junction deviation: highest speed through the corner with the previous segment.
  real junction = 0;
  if (lastValid_) {
    // sin(θ/2) = |u1 + u2| / 2 for unit vectors. Same as sqrt((1 - cos θ) / 2), but without the
    // cancellation that makes a float reversal come out slightly above zero.
    real sx = lastUx_ + ux;
    real sy = lastUy_ + uy;
    real s = minr(1, sqrtf(sx * sx + sy * sy) / 2);
    real a = minr(lastAccel_, accel);
    junction = 1 - s < 1e-6f ? INFINITY : sqrtf(a * p.junction_deviation * s / (1 - s));
    junction = minr(junction, minr(lastNominal_, nominal));
  }

  Segment& seg = at(count_);
  seg.dx = dx;
  seg.dy = dy;
  seg.length = length;
  seg.nominal = nominal;
  seg.accel = accel;
  seg.junction = junction;
  count_++;

  lastValid_ = true;
  lastUx_ = ux;
  lastUy_ = uy;
  lastNominal_ = nominal;
  lastAccel_ = accel;
}

Segment Planner::pop(Trapezoid& profile) {
  // Backward pass: the last queued segment ends at rest; find the highest exit speed of the head
  // from which every queued segment can still slow down in time.
  real bound = 0;
  for (uint8_t k = count_ - 1; k > 0; k--) {
    const Segment& s = at(k);
    bound = minr(s.junction, sqrtf(bound * bound + 2 * s.accel * s.length));
  }
  Segment head = at(0);
  // Forward limit: what acceleration can reach from the frozen entry speed.
  real exit = minr(bound, sqrtf(entry_ * entry_ + 2 * head.accel * head.length));
  profile = trapezoid(head.length, head.accel, entry_, exit, head.nominal);
  entry_ = exit;
  head_ = (head_ + 1) % LOOKAHEAD;
  count_--;
  return head;
}

}  // namespace qs
