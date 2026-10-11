#include "decoder.h"

#include <string.h>

namespace qs {

namespace {
const uint8_t SLOT_PEN = 0, SLOT_MOVE = 2, SLOT_END = 3;  // 1 is the prefix for SIZE / EXT
const uint8_t ARG_EXT = 3;

int16_t sign4(uint8_t v) { return (v & 0x8) ? (int16_t)v - 16 : v; }
int16_t le16(const uint8_t* b) { return (int16_t)(b[0] | (b[1] << 8)); }
}  // namespace

void Decoder::reset() {
  register_ = 0;
  slots_ = 0;
  size_ = 8;
  paused_ = false;
  phase_ = SLOT;
  need_ = 0;
  have_ = 0;
  error_ = ERR_NONE;
}

bool Decoder::fetchSlot(ByteSource& in, uint8_t& slot) {
  if (slots_ == 0) {
    int b = in.read();
    if (b < 0) return false;
    register_ = (uint8_t)b;
    slots_ = 4;
  }
  slot = register_ & 0x3;
  register_ >>= 2;
  slots_--;
  return true;
}

Decoder::Status Decoder::fail(uint8_t code) {
  error_ = code;
  return Failed;
}

Decoder::Status Decoder::next(ByteSource& in, Instruction& out) {
  if (error_) return Failed;
  for (;;) {
    switch (phase_) {
      case SLOT: {
        uint8_t s;
        if (!fetchSlot(in, s)) return NeedMore;
        if (s == SLOT_PEN) {
          pending_ = Op::Pen;
          return finish(out);
        }
        if (s == SLOT_END) {
          pending_ = Op::End;
          return finish(out);
        }
        if (s == SLOT_MOVE) {
          pending_ = Op::Move;
          need_ = size_ == 4 ? 1 : size_ == 8 ? 2 : 4;
          have_ = 0;
          phase_ = DATA;
        } else {
          phase_ = ARG;
        }
        break;
      }
      case ARG: {
        uint8_t a;
        if (!fetchSlot(in, a)) return NeedMore;
        if (a == ARG_EXT) {
          phase_ = EXT_OPCODE;
        } else {
          size_ = 4 << a;
          pending_ = Op::Size;
          return finish(out);
        }
        break;
      }
      case EXT_OPCODE: {
        int b = in.read();
        if (b < 0) return NeedMore;
        have_ = 0;
        switch (b) {
          case 0x00: pending_ = Op::Nop; need_ = 0; break;
          case 0x01: pending_ = Op::Pause; need_ = 0; break;
          case 0x02: pending_ = Op::Resume; need_ = 0; break;
          case 0x03: pending_ = Op::SetParam; need_ = 5; break;
          case 0x04: pending_ = Op::Dwell; need_ = 2; break;
          case 0x05: pending_ = Op::MotorsOff; need_ = 0; break;
          case 0x06: pending_ = Op::ResetParams; need_ = 0; break;
          default: return fail(ERR_UNKNOWN_EXT);
        }
        if (need_ == 0) return finish(out);
        phase_ = DATA;
        break;
      }
      case DATA: {
        while (have_ < need_) {
          int b = in.read();
          if (b < 0) return NeedMore;
          data_[have_++] = (uint8_t)b;
        }
        return finish(out);
      }
    }
  }
}

// Builds `out` from the pending op and its data, and checks the PAUSE/RESUME sequence.
Decoder::Status Decoder::finish(Instruction& out) {
  phase_ = SLOT;
  out.op = pending_;
  switch (pending_) {
    case Op::Size:
      out.bits = size_;
      break;
    case Op::Move:
      if (size_ == 4) {
        out.dx = sign4(data_[0] & 0xF);
        out.dy = sign4(data_[0] >> 4);
      } else if (size_ == 8) {
        out.dx = (int8_t)data_[0];
        out.dy = (int8_t)data_[1];
      } else {
        out.dx = le16(data_);
        out.dy = le16(data_ + 2);
      }
      break;
    case Op::SetParam:
      if (!isParamId(data_[0])) return fail(ERR_UNKNOWN_PARAM);
      out.bits = data_[0];
      memcpy(&out.value, data_ + 1, 4);  // IEEE 754 binary32, little-endian on AVR and native
      break;
    case Op::Dwell:
      out.ms = (uint16_t)(data_[0] | (data_[1] << 8));
      break;
    case Op::End:
      slots_ = 0;  // remaining slots are padding
      size_ = 8;
      break;
    default:
      break;
  }
  if (paused_ != (out.op == Op::Resume)) return fail(ERR_PAUSE_SEQUENCE);
  paused_ = out.op == Op::Pause;
  return Ready;
}

}  // namespace qs
