import { describe, expect, it } from "vitest";
import { compile } from "@/core/quickstep/compile";
import { DEFAULT_PARAMS } from "@/core/quickstep/params";
import { simulate } from "@/core/sim";
import { dotsOf, fitView, speedColor, toCanvas } from "./render";

describe("speedColor", () => {
  it("clamps and spans the scale", () => {
    expect(speedColor(-1)).toBe("rgb(68,1,84)");
    expect(speedColor(0)).toBe("rgb(68,1,84)");
    expect(speedColor(1)).toBe("rgb(253,231,37)");
    expect(speedColor(5)).toBe("rgb(253,231,37)");
  });
});

describe("fitView", () => {
  it("fits all moves inside the canvas", () => {
    const sim = simulate(compile([[{ x: -10, y: 5 }, { x: 30, y: 60 }]], DEFAULT_PARAMS));
    const v = fitView(sim, 400, 300);
    for (const e of sim.events) {
      if (e.kind !== "move") continue;
      for (const p of [e.from, e.to].map((q) => toCanvas(v, q))) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(400);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(300);
      }
    }
  });

  it("fits the whole sheet when a paper is given, centred", () => {
    const sim = simulate(compile([[{ x: 10, y: 10 }, { x: 20, y: 20 }]], DEFAULT_PARAMS));
    const v = fitView(sim, 400, 400, { width: 105, height: 148 });
    const a = toCanvas(v, { x: 0, y: 0 });
    const b = toCanvas(v, { x: 105, y: 148 });
    expect(b.y - a.y).toBeCloseTo(0.94 * 400, 6);
    expect((a.x + b.x) / 2).toBeCloseTo(200, 6);
  });
});

describe("dotsOf", () => {
  it("finds pen taps: pen down directly followed by pen up", () => {
    const sim = simulate(compile([[{ x: 5, y: 5 }], [{ x: 10, y: 0 }, { x: 20, y: 0 }], [{ x: 30, y: 30 }]], DEFAULT_PARAMS, { header: false }));
    const dots = [...dotsOf(sim).values()];
    expect(dots).toHaveLength(2);
    expect(dots[0].x).toBeCloseTo(5, 0);
    expect(dots[1].y).toBeCloseTo(30, 0);
  });
});
