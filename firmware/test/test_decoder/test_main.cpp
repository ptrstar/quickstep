#include <unity.h>

#include <cstring>

#include "../support/vectors.h"
#include "decoder.h"

using qs::Decoder;
using qs::Instruction;
using qs::Op;

void setUp() {}
void tearDown() {}

static const char* opName(Op op) {
  switch (op) {
    case Op::Pen: return "pen";
    case Op::Size: return "size";
    case Op::Move: return "move";
    case Op::End: return "end";
    case Op::Nop: return "nop";
    case Op::Pause: return "pause";
    case Op::Resume: return "resume";
    case Op::SetParam: return "set_param";
    case Op::Dwell: return "dwell";
    case Op::MotorsOff: return "motors_off";
    case Op::ResetParams: return "reset_params";
  }
  return "?";
}

static void expectInstruction(JsonObjectConst want, const Instruction& got, const char* name) {
  TEST_ASSERT_EQUAL_STRING_MESSAGE(want["op"].as<const char*>(), opName(got.op), name);
  switch (got.op) {
    case Op::Size:
      TEST_ASSERT_EQUAL_MESSAGE(want["bits"].as<int>(), got.bits, name);
      break;
    case Op::Move:
      TEST_ASSERT_EQUAL_MESSAGE(want["dx"].as<int>(), got.dx, name);
      TEST_ASSERT_EQUAL_MESSAGE(want["dy"].as<int>(), got.dy, name);
      break;
    case Op::SetParam:
      TEST_ASSERT_EQUAL_MESSAGE(want["id"].as<int>(), got.bits, name);
      TEST_ASSERT_EQUAL_FLOAT_MESSAGE(want["value"].as<float>(), got.value, name);
      break;
    case Op::Dwell:
      TEST_ASSERT_EQUAL_MESSAGE(want["ms"].as<int>(), got.ms, name);
      break;
    default:
      break;
  }
}

// Decodes all of `bytes`. With `trickle`, bytes become available one at a time, so every
// instruction is interrupted by NeedMore wherever it can be.
static std::vector<Instruction> decodeAll(const std::vector<uint8_t>& bytes, bool trickle, uint8_t* error = nullptr) {
  Decoder d;
  BufferSource src(bytes);
  if (trickle) src.limit = 0;
  std::vector<Instruction> out;
  for (;;) {
    Instruction ins;
    Decoder::Status s = d.next(src, ins);
    if (s == Decoder::Ready) {
      out.push_back(ins);
    } else if (s == Decoder::Failed) {
      if (error) *error = d.error();
      break;
    } else if (trickle && src.limit < bytes.size()) {
      src.limit++;
    } else {
      break;
    }
  }
  return out;
}

static void test_encoding_vectors() {
  JsonDocument doc = readJson("protocol/vectors/encoding.json");
  TEST_ASSERT_TRUE(doc.as<JsonArrayConst>().size() > 0);
  for (JsonObjectConst v : doc.as<JsonArrayConst>()) {
    const char* name = v["name"];
    auto bytes = fromHex(v["bytes"]);
    for (bool trickle : {false, true}) {
      auto got = decodeAll(bytes, trickle);
      JsonArrayConst want = v["instructions"];
      TEST_ASSERT_EQUAL_MESSAGE(want.size(), got.size(), name);
      for (size_t i = 0; i < got.size(); i++) expectInstruction(want[i], got[i], name);
    }
  }
}

static void test_error_vectors() {
  JsonDocument doc = readJson("protocol/vectors/errors.json");
  for (JsonObjectConst v : doc.as<JsonArrayConst>()) {
    uint8_t error = 0;
    decodeAll(fromHex(v["bytes"]), false, &error);
    TEST_ASSERT_EQUAL_MESSAGE(v["error"].as<int>(), error, v["name"].as<const char*>());
  }
}

static void test_truncated_waits_for_more() {
  for (const char* hex : {"0E 01", "0D", "3D 03 14 00 00"}) {
    auto bytes = fromHex(hex);
    Decoder d;
    BufferSource src(bytes);
    Instruction ins;
    TEST_ASSERT_EQUAL_MESSAGE(Decoder::NeedMore, d.next(src, ins), hex);
  }
}

static void test_failure_is_sticky() {
  auto bytes = fromHex("0D 07 03");
  Decoder d;
  BufferSource src(bytes);
  Instruction ins;
  TEST_ASSERT_EQUAL(Decoder::Failed, d.next(src, ins));
  TEST_ASSERT_EQUAL(Decoder::Failed, d.next(src, ins));
  d.reset();
  TEST_ASSERT_EQUAL(Decoder::Ready, d.next(src, ins));  // the 03 byte: END
  TEST_ASSERT_EQUAL(Op::End, ins.op);
}

static void test_v1_sample() {
  auto bytes = fromCArray(readRepoFile("legacy/samples/handdrawing.v1.txt"));
  TEST_ASSERT_EQUAL(22210, bytes.size());
  auto got = decodeAll(bytes, false);
  int moves = 0, pens = 0, ends = 0, x = 0, y = 0;
  for (const auto& i : got) {
    if (i.op == Op::Move) {
      moves++;
      x += i.dx;
      y += i.dy;
    }
    pens += i.op == Op::Pen;
    ends += i.op == Op::End;
  }
  TEST_ASSERT_EQUAL(17733, moves);
  TEST_ASSERT_EQUAL(172, pens);
  TEST_ASSERT_EQUAL(1, ends);
  TEST_ASSERT_EQUAL(0, x);
  TEST_ASSERT_EQUAL(0, y);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_encoding_vectors);
  RUN_TEST(test_error_vectors);
  RUN_TEST(test_truncated_waits_for_more);
  RUN_TEST(test_failure_is_sticky);
  RUN_TEST(test_v1_sample);
  return UNITY_END();
}
