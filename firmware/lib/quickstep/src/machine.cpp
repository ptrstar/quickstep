#include "machine.h"

namespace qs {

void Machine::reset() {
  setDefaults(params_);
  planner_.reset();
  penDown_ = false;
  barrier_ = false;
}

void Machine::accept(const Instruction& ins) {
  switch (ins.op) {
    case Op::Move:
      planner_.push(ins.dx, ins.dy, penDown_, params_);
      break;
    case Op::Size:
    case Op::Nop:
    case Op::Resume:
      break;
    default:
      // Everything else is a barrier: it takes effect once all queued motion has run.
      barrier_ = true;
      pending_ = ins;
      break;
  }
}

bool Machine::poll(Action& out, bool starved) {
  for (;;) {
    if (!planner_.empty() && (planner_.full() || barrier_ || starved)) {
      out.kind = Action::Move;
      out.penDown = penDown_;
      out.segment = planner_.pop(out.profile);
      return true;
    }
    if (!barrier_) return false;

    barrier_ = false;
    planner_.endRun();
    switch (pending_.op) {
      case Op::Pen:
        penDown_ = !penDown_;
        out.kind = Action::Pen;
        out.penDown = penDown_;
        out.ms = (uint16_t)params_.pen_settle_ms;
        out.profile = trapezoid(params_.pen_lift_steps, params_.pen_accel, 0, 0, params_.pen_speed);
        return true;
      case Op::SetParam:
        setParam(params_, pending_.bits, pending_.value);
        continue;  // no action
      case Op::ResetParams:
        setDefaults(params_);
        continue;
      case Op::Dwell:
        out.kind = Action::Dwell;
        out.ms = pending_.ms;
        return true;
      case Op::Pause:
        out.kind = Action::Pause;
        return true;
      case Op::MotorsOff:
        out.kind = Action::MotorsOff;
        return true;
      case Op::End:
        out.kind = Action::End;
        return true;
      default:
        continue;
    }
  }
}

}  // namespace qs
