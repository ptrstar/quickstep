import { describe, expect, it } from "vitest";
import { DEMOS, spiral, star } from "./demo";

describe("demo drawings", () => {
  it.each(Object.entries(DEMOS))("%s has strokes with finite, non-negative points", (_, make) => {
    const d = make();
    expect(d.length).toBeGreaterThan(0);
    for (const p of d.flat()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("star rays return to the centre", () => {
    for (const ray of star(10, 8)) expect(ray.at(-1)).toEqual(ray[0]);
  });

  it("spiral points are about segmentLength apart", () => {
    const [s] = spiral(5, 3, 1);
    for (let i = 2; i < s.length; i++) {
      const d = Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
      expect(d).toBeGreaterThan(0.5);
      expect(d).toBeLessThan(1.5);
    }
  });
});
