#include "slicer.h"

#include <math.h>

namespace qs {

static uint32_t uabs(int16_t v) { return v < 0 ? (uint32_t)(-(int32_t)v) : (uint32_t)v; }
static uint32_t umax(uint32_t a, uint32_t b) { return a > b ? a : b; }
static uint32_t msTicks(uint16_t ms) { return (uint32_t)ms * (TICKS_PER_SECOND / 1000); }

void Slicer::begin(const Action& a, const Params& p) {
  mode_ = IDLE;
  waitTicks_ = 0;
  t_ = 0;
  done_ = 0;
  first_ = true;
  switch (a.kind) {
    case Action::Move:
      cx_ = uabs(a.segment.dx) * (uint32_t)lrintf(p.microsteps_x);
      cy_ = uabs(a.segment.dy) * (uint32_t)lrintf(p.microsteps_y);
      cz_ = 0;
      dirs_ = (a.segment.dx > 0 ? DIR_X_POS : 0) | (a.segment.dy > 0 ? DIR_Y_POS : 0);
      profile_ = a.profile;
      break;
    case Action::Pen:
      cx_ = cy_ = 0;
      cz_ = (uint32_t)lrintf(p.pen_lift_steps) * (uint32_t)lrintf(p.microsteps_z);
      dirs_ = a.penDown ? DIR_Z_DOWN : 0;
      profile_ = a.profile;
      waitTicks_ = msTicks(a.ms);
      break;
    case Action::Dwell:
      waitTicks_ = msTicks(a.ms);
      mode_ = waitTicks_ ? WAIT : IDLE;
      return;
    case Action::MotorsOff:
      mode_ = MOTORS_OFF;
      return;
    default:  // Pause, End: nothing to execute
      return;
  }
  major_ = umax(cx_, umax(cy_, cz_));
  if (major_ > 0 && profile_.length > 0) {
    mode_ = MOTION;
  } else {
    mode_ = waitTicks_ ? WAIT : IDLE;
  }
}

bool Slicer::next(Slice& out) {
  for (;;) {
    switch (mode_) {
      case IDLE:
        return false;
      case MOTION:
        if (nextMotion(out)) return true;
        break;  // a slice too short to matter was skipped; try again
      case WAIT: {
        uint32_t chunk = waitTicks_ < SLICE_TICKS ? waitTicks_ : SLICE_TICKS;
        waitTicks_ -= chunk;
        if (waitTicks_ == 0) mode_ = IDLE;
        out.period = (uint16_t)(chunk < MIN_PERIOD ? MIN_PERIOD : chunk);
        out.events = 1;
        out.flags = SLICE_NO_STEP;
        return true;
      }
      case MOTORS_OFF:
        mode_ = IDLE;
        out.period = MIN_PERIOD;
        out.events = 1;
        out.flags = SLICE_NO_STEP | SLICE_MOTORS_OFF;
        return true;
    }
  }
}

// One slice of the motion: how far the profile gets in the next SLICE_TICKS, rounded to whole
// events, spread evenly over the slice.
bool Slicer::nextMotion(Slice& out) {
  const real duration = profile_.duration();
  real t1 = t_ + (real)SLICE_TICKS / TICKS_PER_SECOND;
  bool last = t1 >= duration;
  if (last) t1 = duration;

  uint32_t target = major_;
  if (!last) {
    target = (uint32_t)lrintf(distanceAt(profile_, t1) / profile_.length * major_);
    if (target > major_) target = major_;
  }
  uint32_t events = target - done_;
  uint32_t ticks = (uint32_t)lrintf((t1 - t_) * TICKS_PER_SECOND);
  t_ = t1;
  done_ = target;
  if (last) mode_ = waitTicks_ ? WAIT : IDLE;

  if (events == 0) {
    // No step falls into this slice (slow start or end): just let the time pass.
    if (ticks < MIN_PERIOD && !first_) return false;
    events = 1;
    out.flags = SLICE_NO_STEP;
    out.period = (uint16_t)(ticks < MIN_PERIOD ? MIN_PERIOD : ticks);
  } else {
    out.flags = 0;
    uint32_t period = ticks / events;
    out.period = (uint16_t)(period < MIN_PERIOD ? MIN_PERIOD : period);
  }
  out.events = (uint16_t)events;
  if (first_) {
    first_ = false;
    out.flags |= SLICE_NEW_MOVE;
    out.dirs = dirs_;
    out.cx = cx_;
    out.cy = cy_;
    out.cz = cz_;
    out.major = major_;
  }
  return true;
}

}  // namespace qs
