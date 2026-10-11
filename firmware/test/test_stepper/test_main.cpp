#include <unity.h>

#include <cmath>
#include <cstdlib>

#include "../support/vectors.h"
#include "decoder.h"
#include "machine.h"
#include "slicer.h"
#include "step_core.h"

using namespace qs;

void setUp() {}
void tearDown() {}

static Params defaults() {
  Params p;
  setDefaults(p);
  return p;
}

static Action moveAction(int16_t dx, int16_t dy, const Params& p, bool penDown = true) {
  Planner planner;
  planner.push(dx, dy, penDown, p);
  Action a;
  a.kind = Action::Move;
  a.penDown = penDown;
  a.segment = planner.pop(a.profile);
  return a;
}

static void test_slicer_covers_the_move_in_time() {
  Params p = defaults();
  Action a = moveAction(500, 0, p);  // 100 mm, rest to rest
  Slicer s;
  s.begin(a, p);
  Slice sl;
  uint32_t steps = 0;
  double ticks = 0;
  int slices = 0;
  while (s.next(sl)) {
    if (slices++ == 0) {
      TEST_ASSERT_TRUE(sl.flags & SLICE_NEW_MOVE);
      TEST_ASSERT_EQUAL_UINT32(4000, sl.major);  // 500 full steps × 8
      TEST_ASSERT_EQUAL_UINT8(DIR_X_POS, sl.dirs);
    }
    TEST_ASSERT_TRUE(sl.period >= MIN_PERIOD);
    TEST_ASSERT_TRUE(sl.events >= 1);
    if (!(sl.flags & SLICE_NO_STEP)) steps += sl.events;
    ticks += (double)sl.events * sl.period;
  }
  TEST_ASSERT_EQUAL_UINT32(4000, steps);
  double want = a.profile.duration() * TICKS_PER_SECOND;
  TEST_ASSERT_TRUE(std::fabs(ticks - want) / want < 0.005);
}

static void test_slicer_follows_the_speed_profile() {
  // At every slice, the step rate matches the profile speed at that time within one step per slice.
  Params p = defaults();
  Action a = moveAction(500, 0, p);
  Slicer s;
  s.begin(a, p);
  Slice sl;
  double t = 0;
  const double stepsPerMm = p.steps_per_mm_x * p.microsteps_x;
  while (s.next(sl)) {
    double dt = (double)sl.events * sl.period / TICKS_PER_SECOND;
    if (!(sl.flags & SLICE_NO_STEP) && dt > 0.004) {
      double mid = t + dt / 2;
      double speed = (distanceAt(a.profile, mid + 0.0001) - distanceAt(a.profile, mid - 0.0001)) / 0.0002;
      double rate = sl.events / dt / stepsPerMm;
      TEST_ASSERT_TRUE(std::fabs(rate - speed) <= 1.0 / dt / stepsPerMm + 0.05 * speed);
    }
    t += dt;
  }
}

static void test_slicer_waits() {
  Params p = defaults();
  Action a;
  a.kind = Action::Dwell;
  a.ms = 250;
  Slicer s;
  s.begin(a, p);
  Slice sl;
  uint32_t ticks = 0;
  while (s.next(sl)) {
    TEST_ASSERT_TRUE(sl.flags & SLICE_NO_STEP);
    ticks += sl.period * sl.events;
  }
  TEST_ASSERT_EQUAL_UINT32(500000, ticks);

  a.kind = Action::MotorsOff;
  s.begin(a, p);
  TEST_ASSERT_TRUE(s.next(sl));
  TEST_ASSERT_TRUE(sl.flags & SLICE_MOTORS_OFF);
  TEST_ASSERT_FALSE(s.next(sl));

  a.kind = Action::End;
  s.begin(a, p);
  TEST_ASSERT_FALSE(s.next(sl));
}

static void test_step_core_bresenham_counts() {
  srand(1);
  for (int round = 0; round < 200; round++) {
    uint32_t cx = rand() % 3000, cy = rand() % 3000, cz = rand() % 50;
    uint32_t major = cx > cy ? cx : cy;
    if (cz > major) major = cz;
    if (major == 0) continue;
    SliceQueue q;
    StepCore core;
    uint32_t left = major;
    bool first = true;
    uint32_t nx = 0, ny = 0, nz = 0;
    for (;;) {
      while (left > 0 && !q.full()) {
        Slice s{};
        s.period = 100;
        s.events = left < 37 ? left : 37;
        left -= s.events;
        if (first) {
          s.flags = SLICE_NEW_MOVE;
          s.cx = cx;
          s.cy = cy;
          s.cz = cz;
          s.major = major;
          first = false;
        }
        q.push(s);
      }
      StepEvent e = core.tick(q);
      nx += (e.steps & STEP_X) != 0;
      ny += (e.steps & STEP_Y) != 0;
      nz += (e.steps & STEP_Z) != 0;
      if (e.idle && left == 0) break;
    }
    TEST_ASSERT_EQUAL_UINT32(cx, nx);
    TEST_ASSERT_EQUAL_UINT32(cy, ny);
    TEST_ASSERT_EQUAL_UINT32(cz, nz);
  }
}

// The whole chain as on the device: decoder → machine → slicer → slice queue → step core.
struct ChainResult {
  int64_t x = 0, y = 0, z = 0;  // microsteps
  int64_t wantX = 0, wantY = 0;
  double seconds = 0;
  bool motorsOff = false;
};

static ChainResult runChain(const std::vector<uint8_t>& bytes, JsonArrayConst params) {
  Machine m;
  for (JsonArrayConst p : params) {
    Instruction set{};
    set.op = Op::SetParam;
    set.bits = p[0].as<int>();
    set.value = p[1].as<float>();
    m.accept(set);
    Action ignored;
    while (m.poll(ignored)) {
    }
  }
  Decoder d;
  BufferSource src(bytes);
  Slicer slicer;
  SliceQueue q;
  StepCore core;
  ChainResult r;
  uint8_t dirs = 0;
  bool inputDone = false;

  for (;;) {
    Instruction ins;
    while (!inputDone && m.canAccept()) {
      Decoder::Status s = d.next(src, ins);
      if (s != Decoder::Ready) {
        inputDone = true;
        break;
      }
      m.accept(ins);
    }
    Action a;
    if (!slicer.busy() && m.poll(a, inputDone)) {
      if (a.kind == Action::Move) {
        r.wantX += (int64_t)a.segment.dx * lrintf(m.params().microsteps_x);
        r.wantY += (int64_t)a.segment.dy * lrintf(m.params().microsteps_y);
      }
      slicer.begin(a, m.params());
    }
    Slice s;
    while (!q.full() && slicer.next(s)) {
      q.push(s);
      r.seconds += (double)s.events * s.period / TICKS_PER_SECOND;
    }
    StepEvent e = core.tick(q);
    if (e.steps & STEP_X) r.x += (dirs & DIR_X_POS) ? 1 : -1;
    if (e.steps & STEP_Y) r.y += (dirs & DIR_Y_POS) ? 1 : -1;
    if (e.steps & STEP_Z) r.z += (dirs & DIR_Z_DOWN) ? 1 : -1;
    if (e.setDirs) dirs = e.dirs;
    if (e.motorsOff) r.motorsOff = true;
    if (e.idle && inputDone && !slicer.busy() && q.empty()) {
      Action rest;
      if (!m.poll(rest, true)) break;
      slicer.begin(rest, m.params());
    }
  }
  return r;
}

static void test_chain_reproduces_planner_vectors() {
  JsonDocument doc = readJson("protocol/vectors/planner.json");
  for (JsonObjectConst c : doc.as<JsonArrayConst>()) {
    std::string name = c["name"].as<const char*>();
    ChainResult r = runChain(fromHex(c["bytes"]), c["params"]);
    TEST_ASSERT_EQUAL_INT64_MESSAGE(r.wantX, r.x, (name + " x").c_str());
    TEST_ASSERT_EQUAL_INT64_MESSAGE(r.wantY, r.y, (name + " y").c_str());
    TEST_ASSERT_EQUAL_INT64_MESSAGE(0, r.z, (name + " pen back up").c_str());
    double want = c["duration"].as<double>();
    double err = std::fabs(r.seconds - want) / want;
    std::string msg = name + ": slices take " + std::to_string(r.seconds) + " s, simulator " + std::to_string(want) + " s";
    TEST_MESSAGE((msg + ", x " + std::to_string(r.x) + " µsteps").c_str());
    TEST_ASSERT_TRUE_MESSAGE(err < 0.002, msg.c_str());
  }
}

static void test_memory() {
  // RAM budget on the AVR (sizes there are a bit smaller: 2-byte ints and pointers).
  TEST_ASSERT_TRUE(sizeof(SliceQueue) <= 8 * 24 + 4);
  TEST_ASSERT_TRUE(sizeof(Slicer) <= 80);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_slicer_covers_the_move_in_time);
  RUN_TEST(test_slicer_follows_the_speed_profile);
  RUN_TEST(test_slicer_waits);
  RUN_TEST(test_step_core_bresenham_counts);
  RUN_TEST(test_chain_reproduces_planner_vectors);
  RUN_TEST(test_memory);
  return UNITY_END();
}
