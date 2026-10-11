#include "params.h"

namespace qs {

void setDefaults(Params& p) {
  p.steps_per_mm_x = 5.0f;
  p.steps_per_mm_y = 200.0f / 42.0f;
  p.microsteps_x = 8;
  p.microsteps_y = 8;
  p.microsteps_z = 8;
  p.draw_speed = 20;
  p.travel_speed = 40;
  p.max_speed_x = 100;
  p.max_speed_y = 60;
  p.accel_x = 300;
  p.accel_y = 150;
  p.junction_deviation = 0.05f;
  p.pen_lift_steps = 20;
  p.pen_speed = 400;
  p.pen_accel = 4000;
  p.pen_settle_ms = 0;
}

static real* field(Params& p, uint8_t id) {
  switch (id) {
    case 0x01: return &p.steps_per_mm_x;
    case 0x02: return &p.steps_per_mm_y;
    case 0x03: return &p.microsteps_x;
    case 0x04: return &p.microsteps_y;
    case 0x05: return &p.microsteps_z;
    case 0x10: return &p.draw_speed;
    case 0x11: return &p.travel_speed;
    case 0x12: return &p.max_speed_x;
    case 0x13: return &p.max_speed_y;
    case 0x14: return &p.accel_x;
    case 0x15: return &p.accel_y;
    case 0x16: return &p.junction_deviation;
    case 0x20: return &p.pen_lift_steps;
    case 0x21: return &p.pen_speed;
    case 0x22: return &p.pen_accel;
    case 0x23: return &p.pen_settle_ms;
    default: return nullptr;
  }
}

bool isParamId(uint8_t id) {
  Params p;
  return field(p, id) != nullptr;
}

bool setParam(Params& p, uint8_t id, real value) {
  real* f = field(p, id);
  if (!f) return false;
  *f = value;
  return true;
}

}  // namespace qs
