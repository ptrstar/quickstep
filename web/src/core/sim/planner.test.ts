import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../quickstep/params";
import { junctionSpeed, LOOKAHEAD, planRun, type Segment, segment } from "./planner";
import { sample, trapezoid } from "./trapezoid";

const P = DEFAULT_PARAMS; // draw 20 mm/s, accel x 300 / y 150, δ 0.05
const along = (dx: number, dy: number, penDown = true) => segment(dx, dy, penDown, P)!;

describe("trapezoid", () => {
  it("rest to rest with cruise: L/v + v/a", () => {
    expect(trapezoid(100, 300, 0, 0, 20).duration).toBeCloseTo(100 / 20 + 20 / 300, 12);
  });

  it("too short to reach nominal speed: triangle", () => {
    const p = trapezoid(0.5, 300, 0, 0, 20);
    expect(p.peak).toBeCloseTo(Math.sqrt(150), 12);
    expect(p.cruiseTime).toBe(0);
    expect(p.duration).toBeCloseTo((2 * Math.sqrt(150)) / 300, 12);
  });

  it("different entry and exit speeds", () => {
    // accel 10→20 over 0.5 mm, decel 20→0 over 2/3 mm, cruise the rest
    const p = trapezoid(100, 300, 10, 0, 20);
    expect(p.duration).toBeCloseTo(10 / 300 + (100 - 0.5 - 400 / 600) / 20 + 20 / 300, 12);
  });

  it("samples continuously from entry to exit", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 200, noNaN: true }),
        fc.double({ min: 10, max: 2000, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (length, accel, e, x) => {
          // entry/exit reachable from each other within the length, as the planner guarantees
          const nominal = 50;
          const entry = e * Math.min(nominal, Math.sqrt(2 * accel * length));
          const exit = x * Math.min(nominal, Math.sqrt(entry * entry + 2 * accel * length));
          const p = trapezoid(length, accel, entry, exit, nominal);
          expect(sample(p, 0)).toEqual({ distance: 0, speed: entry });
          const end = sample(p, p.duration);
          expect(end.distance).toBeCloseTo(length, 6);
          expect(end.speed).toBeCloseTo(exit, 6);
          expect(p.peak).toBeLessThanOrEqual(nominal + 1e-9);
          let prev = 0;
          for (let i = 1; i <= 50; i++) {
            const d = sample(p, (p.duration * i) / 50).distance;
            expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = d;
          }
        },
      ),
    );
  });
});

describe("segment limits", () => {
  it("caps speed and acceleration per axis", () => {
    const y = along(0, 10); // y only: 60 mm/s max, 150 mm/s²
    expect(y.accel).toBe(150);
    const fast = segment(0, 10, false, { ...P, travel_speed: 500 })!;
    expect(fast.nominal).toBe(60);
    const diag = along(10, 10); // |u| = 1/√2 on both: accel min(300√2, 150√2)
    expect(diag.accel).toBeCloseTo(150 * Math.SQRT2, 9);
  });

  it("uses travel speed with the pen up", () => {
    expect(along(10, 0, false).nominal).toBe(40);
    expect(along(10, 0, true).nominal).toBe(20);
  });
});

describe("junctionSpeed", () => {
  it("straight on is only limited by the nominal speed", () => {
    expect(junctionSpeed(along(1, 0), along(5, 0), 0.05)).toBe(20);
  });

  it("full reversal stops", () => {
    expect(junctionSpeed(along(1, 0), along(-1, 0), 0.05)).toBeCloseTo(0, 6);
  });

  it("90° corner from x to y: sqrt(a·δ·s/(1-s)) with a = min(300, 150)", () => {
    const s = Math.SQRT1_2;
    expect(junctionSpeed(along(1, 0), along(0, 1), 0.05)).toBeCloseTo(Math.sqrt((150 * 0.05 * s) / (1 - s)), 9);
  });
});

describe("planRun", () => {
  it("a single segment runs rest to rest", () => {
    const [p] = planRun([along(100, 0)], P.junction_deviation);
    expect(p.entry).toBe(0);
    expect(p.exit).toBe(0);
    expect(p.duration).toBeCloseTo(100 / 20 + 20 / 300, 12);
  });

  it("collinear pieces take as long as one segment", () => {
    const pieces = planRun([along(50, 0), along(30, 0), along(20, 0)], P.junction_deviation);
    const total = pieces.reduce((t, p) => t + p.duration, 0);
    expect(total).toBeCloseTo(100 / 20 + 20 / 300, 9);
  });

  it("slows to the junction speed at a 90° corner", () => {
    const [a, b] = planRun([along(50, 0), along(0, 50)], P.junction_deviation);
    expect(a.exit).toBeCloseTo(junctionSpeed(along(1, 0), along(0, 1), P.junction_deviation), 9);
    expect(b.entry).toBe(a.exit);
  });

  it("lookahead limits the speed on dense paths: v = sqrt(2·a·19·L)", () => {
    // 0.2 mm pieces (one full step on x) and a high speed limit: braking distance decides.
    const fast = { ...P, draw_speed: 100 };
    const segs = Array.from({ length: 100 }, () => segment(0.2, 0, true, fast)!);
    const plan = planRun(segs, P.junction_deviation);
    const steady = Math.sqrt(2 * 300 * (LOOKAHEAD - 1) * 0.2);
    expect(plan[50].entry).toBeCloseTo(steady, 9);
    expect(plan[50].exit).toBeCloseTo(steady, 9);
    // a longer window would go faster
    expect(planRun(segs, P.junction_deviation, 40)[50].exit).toBeGreaterThan(steady + 10);
  });

  it("satisfies the motion constraints on random paths", () => {
    const move = fc
      .tuple(fc.double({ min: -30, max: 30, noNaN: true }), fc.double({ min: -30, max: 30, noNaN: true }), fc.boolean())
      .map(([dx, dy, pen]) => segment(dx, dy, pen, P))
      .filter((s): s is Segment => s !== null && s.length > 1e-6);
    fc.assert(
      fc.property(fc.array(move, { minLength: 1, maxLength: 60 }), fc.double({ min: 0.001, max: 1, noNaN: true }), (segs, dev) => {
        const plan = planRun(segs, dev);
        expect(plan[0].entry).toBe(0);
        expect(plan.at(-1)!.exit).toBe(0);
        plan.forEach((p, i) => {
          const s = segs[i];
          const tol = 1e-9 * (1 + p.peak * p.peak);
          expect(Math.abs(p.exit ** 2 - p.entry ** 2)).toBeLessThanOrEqual(2 * s.accel * s.length + tol);
          expect(p.peak).toBeLessThanOrEqual(s.nominal + 1e-9);
          if (i > 0) {
            expect(p.entry).toBe(plan[i - 1].exit);
            expect(p.entry).toBeLessThanOrEqual(junctionSpeed(segs[i - 1], s, dev) + 1e-9);
          }
        });
      }),
    );
  });
});
