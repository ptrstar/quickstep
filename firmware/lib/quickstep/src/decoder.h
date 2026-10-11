// Streaming QUICKSTEP v2 decoder (protocol/SPEC.md §1-4).
//
// Bytes arrive in pieces over serial, so the decoder can stop in the middle of an instruction
// (NeedMore) and continue when more bytes are available.
#pragma once

#include <stdint.h>

#include "params.h"

namespace qs {

enum class Op : uint8_t { Pen, Size, Move, End, Nop, Pause, Resume, SetParam, Dwell, MotorsOff, ResetParams };

struct Instruction {
  Op op;
  uint8_t bits;  // Size: 4, 8 or 16. SetParam: parameter id.
  int16_t dx, dy;  // Move, full steps
  uint16_t ms;  // Dwell
  real value;  // SetParam
};

// Device error codes (SPEC §5).
enum Error : uint8_t {
  ERR_NONE = 0,
  ERR_UNKNOWN_EXT = 0x81,
  ERR_UNKNOWN_PARAM = 0x82,
  ERR_PAUSE_SEQUENCE = 0x83,
  ERR_RX_OVERRUN = 0x84,
};

// Where the decoder pulls bytes from. read() returns -1 when nothing is available yet.
struct ByteSource {
  virtual int read() = 0;
};

class Decoder {
 public:
  enum Status : uint8_t { Ready, NeedMore, Failed };

  Decoder() { reset(); }
  void reset();

  // Decodes the next instruction into `out`. Once Failed, it stays failed until reset().
  Status next(ByteSource& in, Instruction& out);
  uint8_t error() const { return error_; }

 private:
  enum Phase : uint8_t { SLOT, ARG, EXT_OPCODE, DATA };

  bool fetchSlot(ByteSource& in, uint8_t& slot);
  Status finish(Instruction& out);
  Status fail(uint8_t code);

  uint8_t register_;
  uint8_t slots_;
  uint8_t size_;
  bool paused_;
  Phase phase_;
  Op pending_;
  uint8_t need_;
  uint8_t have_;
  uint8_t data_[5];
  uint8_t error_;
};

}  // namespace qs
