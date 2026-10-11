// The step interrupt's logic, without hardware access, so it can be tested natively.
//
// The timer fires after each period. At every firing the ISR calls StepCore::tick(), pulses the
// returned step mask, applies direction/enable changes and programs the next period.
#pragma once

#include <stdint.h>

#include "slicer.h"

namespace qs {

const uint8_t SLICE_QUEUE = 8;  // 40 ms of motion at full slices
const uint16_t IDLE_PERIOD = 2000;  // 1 ms between checks while there is nothing to do

enum StepMask : uint8_t { STEP_X = 1, STEP_Y = 2, STEP_Z = 4 };

// Single producer (main loop) / single consumer (ISR) ring. Indices are single bytes, which the AVR
// reads and writes atomically.
class SliceQueue {
 public:
  bool empty() const { return head_ == tail_; }
  bool full() const { return (uint8_t)(tail_ + 1) % SLICE_QUEUE == head_; }
  uint8_t size() const { return (uint8_t)(tail_ + SLICE_QUEUE - head_) % SLICE_QUEUE; }
  // Main loop side.
  void push(const Slice& s) {
    buf_[tail_] = s;
    tail_ = (uint8_t)(tail_ + 1) % SLICE_QUEUE;
  }
  // ISR side.
  const Slice& front() const { return buf_[head_]; }
  void pop() { head_ = (uint8_t)(head_ + 1) % SLICE_QUEUE; }
  void clear() { head_ = tail_; }

 private:
  Slice buf_[SLICE_QUEUE];
  volatile uint8_t head_ = 0;
  volatile uint8_t tail_ = 0;
};

struct StepEvent {
  uint8_t steps;  // StepMask: axes to pulse now
  bool setDirs;  // apply `dirs` after the pulses (a new move starts)
  uint8_t dirs;
  bool enable;  // drivers must be on for the coming slice
  bool motorsOff;
  uint16_t period;  // ticks until the next tick()
  bool idle;  // nothing queued
};

class StepCore {
 public:
  StepEvent tick(SliceQueue& q) {
    StepEvent e = {0, false, 0, false, false, IDLE_PERIOD, false};
    if (remaining_ > 0) {
      if (!(flags_ & SLICE_NO_STEP)) {
        // Bresenham: the dominant axis steps every event, the others proportionally.
        if ((ex_ -= cx_) < 0) {
          ex_ += major_;
          e.steps |= STEP_X;
        }
        if ((ey_ -= cy_) < 0) {
          ey_ += major_;
          e.steps |= STEP_Y;
        }
        if ((ez_ -= cz_) < 0) {
          ez_ += major_;
          e.steps |= STEP_Z;
        }
      }
      if (flags_ & SLICE_MOTORS_OFF) e.motorsOff = true;
      remaining_--;
    }
    if (remaining_ == 0) {
      if (q.empty()) {
        e.idle = true;
        return e;
      }
      const Slice& s = q.front();
      remaining_ = s.events;
      period_ = s.period;
      flags_ = s.flags;
      if (s.flags & SLICE_NEW_MOVE) {
        cx_ = s.cx;
        cy_ = s.cy;
        cz_ = s.cz;
        major_ = s.major;
        ex_ = ey_ = ez_ = (int32_t)(s.major >> 1);  // shift, not "/ 2": no division routine in the ISR
        e.setDirs = true;
        e.dirs = s.dirs;
      }
      q.pop();
      if (!(flags_ & SLICE_NO_STEP)) e.enable = true;
    }
    e.period = period_;
    return e;
  }

  void reset() { remaining_ = 0; }

 private:
  uint16_t remaining_ = 0;
  uint16_t period_ = IDLE_PERIOD;
  uint8_t flags_ = 0;
  int32_t ex_ = 0, ey_ = 0, ez_ = 0;
  int32_t cx_ = 0, cy_ = 0, cz_ = 0, major_ = 1;
};

}  // namespace qs
