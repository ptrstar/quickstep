#include <unity.h>

#include <cmath>

#include "../support/vectors.h"
#include "decoder.h"
#include "machine.h"

using qs::Action;
using qs::Decoder;
using qs::Instruction;
using qs::Machine;

void setUp() {}
void tearDown() {}

struct Run {
  std::vector<qs::Trapezoid> moves;
  double duration = 0;  // double here only to sum many float durations without drift
  int penToggles = 0;
};

static void record(Run& run, const Action& a) {
  switch (a.kind) {
    case Action::Move:
      run.moves.push_back(a.profile);
      run.duration += a.profile.duration();
      break;
    case Action::Pen:
      run.penToggles++;
      run.duration += a.profile.duration() + a.ms / 1000.0;
      break;
    case Action::Dwell:
      run.duration += a.ms / 1000.0;
      break;
    default:
      break;
  }
}

// Runs a program the way the main loop will, with the buffer always full: accept instructions
// while possible, and take every action as soon as it is ready.
static Run runProgram(const std::vector<uint8_t>& bytes, JsonArrayConst params) {
  Machine m;
  Decoder d;
  BufferSource src(bytes);
  Run run;
  Action a;
  // the device's parameters before the program starts
  for (JsonArrayConst p : params) {
    Instruction set{};
    set.op = qs::Op::SetParam;
    set.bits = p[0].as<int>();
    set.value = p[1].as<float>();
    m.accept(set);
    while (m.poll(a)) record(run, a);
  }
  Instruction ins;
  while (d.next(src, ins) == Decoder::Ready) {
    while (!m.canAccept() && m.poll(a)) record(run, a);
    m.accept(ins);
    while (m.poll(a)) record(run, a);
  }
  TEST_ASSERT_EQUAL(0, d.error());
  while (m.poll(a, true)) record(run, a);
  return run;
}

static void expectClose(double want, double got, double rel, const char* what) {
  double tol = rel * (std::fabs(want) > 1 ? std::fabs(want) : 1);
  if (std::fabs(want - got) > tol) {
    std::string msg = std::string(what) + ": want " + std::to_string(want) + ", got " + std::to_string(got);
    TEST_FAIL_MESSAGE(msg.c_str());
  }
}

static void test_planner_vectors() {
  JsonDocument doc = readJson("protocol/vectors/planner.json");
  JsonArrayConst cases = doc.as<JsonArrayConst>();
  TEST_ASSERT_TRUE(cases.size() > 0);
  for (JsonObjectConst c : cases) {
    std::string name = c["name"].as<const char*>();
    Run run = runProgram(fromHex(c["bytes"]), c["params"]);

    TEST_ASSERT_EQUAL_MESSAGE(c["moveCount"].as<int>(), (int)run.moves.size(), name.c_str());
    TEST_ASSERT_EQUAL_MESSAGE(c["penToggles"].as<int>(), run.penToggles, name.c_str());
    expectClose(c["duration"].as<double>(), run.duration, 1e-4, (name + " duration").c_str());

    JsonArrayConst moves = c["moves"];
    if (moves.isNull()) continue;
    for (size_t i = 0; i < run.moves.size(); i++) {
      const qs::Trapezoid& p = run.moves[i];
      JsonArrayConst want = moves[i];
      std::string at = name + " move " + std::to_string(i);
      // float32 against the double-precision simulator
      expectClose(want[0].as<double>(), p.entry, 1e-3, (at + " entry").c_str());
      expectClose(want[1].as<double>(), p.exit, 1e-3, (at + " exit").c_str());
      expectClose(want[2].as<double>(), p.peak, 1e-3, (at + " peak").c_str());
      expectClose(want[3].as<double>(), p.duration(), 1e-3, (at + " duration").c_str());
    }
  }
}

static void test_trapezoid_by_hand() {
  qs::Trapezoid t = qs::trapezoid(100, 300, 0, 0, 20);
  TEST_ASSERT_FLOAT_WITHIN(1e-4, 100.0 / 20 + 20.0 / 300, t.duration());
  qs::Trapezoid tri = qs::trapezoid(0.5f, 300, 0, 0, 20);
  TEST_ASSERT_FLOAT_WITHIN(1e-4, std::sqrt(150.0), tri.peak);
  TEST_ASSERT_EQUAL_FLOAT(0, tri.cruiseTime);
}

static void test_corner_by_hand() {
  // 10 mm along x, then 10 mm along y: junction speed sqrt(a·δ·s/(1-s)), a = min(300, 150)
  Machine m;
  Instruction pen{}, a{}, b{};
  pen.op = qs::Op::Pen;
  a.op = b.op = qs::Op::Move;
  a.dx = 50;  // 10 mm at 5 steps/mm
  b.dy = 48;  // ~10 mm at 4.76 steps/mm
  m.accept(pen);
  Action act;
  TEST_ASSERT_TRUE(m.poll(act));
  TEST_ASSERT_EQUAL(Action::Pen, act.kind);
  m.accept(a);
  m.accept(b);
  TEST_ASSERT_FALSE(m.poll(act));  // lookahead not full, not starved: wait
  TEST_ASSERT_TRUE(m.poll(act, true));
  double s = std::sqrt(0.5);
  TEST_ASSERT_FLOAT_WITHIN(1e-4, std::sqrt(150 * 0.05 * s / (1 - s)), act.profile.exit);
}

static void test_planner_memory() {
  // The whole planner state must stay small on a 2 KB AVR.
  TEST_ASSERT_TRUE(sizeof(qs::Planner) <= 450);
  TEST_ASSERT_TRUE(sizeof(qs::Machine) <= 560);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_trapezoid_by_hand);
  RUN_TEST(test_corner_by_hand);
  RUN_TEST(test_planner_vectors);
  RUN_TEST(test_planner_memory);
  return UNITY_END();
}
