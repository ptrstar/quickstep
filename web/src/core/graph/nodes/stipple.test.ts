import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../../geometry";
import type { GrayImage, Lines } from "../types";
import { registry } from ".";
import { createNode } from "../doc";
import { PointGrid, random, stipple, tour, tourLength } from "./stipple";

const gray = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
};
const OPTS = { points: 300, iterations: 30, gamma: 1, cutoff: 0.95, seed: 7 };

/** Coefficient of variation of nearest-neighbour distances: lower = more even spacing. */
function unevenness(pts: Point[]) {
  const nn = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
  const mean = nn.reduce((a, v) => a + v, 0) / nn.length;
  return Math.sqrt(nn.reduce((a, v) => a + (v - mean) ** 2, 0) / nn.length) / mean;
}

describe("PointGrid", () => {
  it("finds the same nearest point as brute force", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: fc.double({ min: 0, max: 50, noNaN: true }), y: fc.double({ min: 0, max: 30, noNaN: true }) }), { minLength: 1, maxLength: 60 }),
        fc.array(fc.record({ x: fc.double({ min: -5, max: 55, noNaN: true }), y: fc.double({ min: -5, max: 35, noNaN: true }) }), { minLength: 1, maxLength: 20 }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        (pts, queries, size) => {
          const grid = new PointGrid(pts, 50, 30, size);
          for (const q of queries) {
            const d = (i: number) => Math.hypot(pts[i].x - q.x, pts[i].y - q.y);
            const brute = Math.min(...pts.map((_, i) => d(i)));
            expect(d(grid.nearest(q.x, q.y))).toBeCloseTo(brute, 9);
          }
        },
      ),
    );
  });
});

describe("stipple", () => {
  it("is reproducible with the same seed", () => {
    const g = gray(40, 40, (x) => x / 40);
    expect(stipple(g, OPTS)).toEqual(stipple(g, OPTS));
    expect(stipple(g, { ...OPTS, seed: 8 }).points).not.toEqual(stipple(g, OPTS).points);
    const a = random(3);
    const b = random(3);
    const seq = Array.from({ length: 100 }, () => a());
    expect(seq).toEqual(Array.from({ length: 100 }, () => b()));
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("puts the dots where it is dark, and none on white", () => {
    const half = gray(100, 100, (x) => (x < 50 ? 0 : 1));
    const { points } = stipple(half, OPTS);
    expect(points).toHaveLength(300);
    expect(points.filter((p) => p.x < 50).length / points.length).toBeGreaterThanOrEqual(0.99);
    expect(stipple(gray(30, 30, () => 1), OPTS).points).toEqual([]);
  });

  it("always places the requested number of dots, even on a mostly white picture", () => {
    const spot = gray(300, 300, (x, y) => (Math.hypot(x - 150, y - 150) < 4 ? 0 : 1));
    const { points } = stipple(spot, { ...OPTS, points: 2500, iterations: 0 });
    expect(points).toHaveLength(2500);
    for (const p of points) expect(Math.hypot(p.x - 150, p.y - 150)).toBeLessThan(6);
  });

  it("darker areas get more dots", () => {
    const ramp = gray(120, 40, (x) => x / 120);
    const { points } = stipple(ramp, OPTS);
    const left = points.filter((p) => p.x < 40).length;
    const right = points.filter((p) => p.x >= 80).length;
    expect(left).toBeGreaterThan(2 * right);
  });

  it("relaxation spaces the dots evenly", () => {
    const flat = gray(80, 80, () => 0);
    const raw = stipple(flat, { ...OPTS, points: 150, iterations: 0 }).points;
    const relaxed = stipple(flat, { ...OPTS, points: 150, iterations: 30 }).points;
    expect(unevenness(relaxed)).toBeLessThan(0.6 * unevenness(raw));
  });
});

describe("tour", () => {
  it("visits every dot once and is far shorter than a random order", () => {
    const rnd = random(5);
    const pts = Array.from({ length: 400 }, () => ({ x: rnd() * 100, y: rnd() * 100 }));
    const t = tour(pts);
    expect(t).toHaveLength(pts.length);
    expect(new Set(t)).toEqual(new Set(pts));
    expect(tourLength(t)).toBeLessThan(tourLength(pts) / 5);
    expect(tourLength(t)).toBeLessThanOrEqual(tourLength(tour(pts, 0)) + 1e-9); // 2-opt never makes it longer
  });
});

describe("Stippling node", () => {
  const g = gray(60, 60, (x, y) => (Math.hypot(x - 30, y - 30) < 20 ? 0.2 : 1));
  const run = (params: Record<string, string | number>) => {
    const n = createNode(registry, "stipple", { x: 0, y: 0 }, { points: 200, ...params });
    return registry.get("stipple")!.compute({ gray: g }, n.params, { assets: new Map() }).lines as Lines;
  };

  it("radius 0 draws dots: single points", () => {
    const l = run({ style: "marks", size: 0 });
    expect(l.strokes).toHaveLength(200);
    expect(l.strokes.every((s) => s.length === 1)).toBe(true);
  });

  it("a radius above 0 draws closed circles of exactly that radius", () => {
    const l = run({ style: "marks", size: 2 });
    expect(l.strokes).toHaveLength(200);
    for (const s of l.strokes) {
      expect(s[0].x).toBeCloseTo(s.at(-1)!.x);
      expect(s[0].y).toBeCloseTo(s.at(-1)!.y);
      const cx = s.slice(1).reduce((a, p) => a + p.x, 0) / (s.length - 1);
      const cy = s.slice(1).reduce((a, p) => a + p.y, 0) / (s.length - 1);
      for (const p of s) expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(2, 6);
    }
  });

  it("one line goes through all dots", () => {
    const l = run({ style: "line" });
    expect(l.strokes).toHaveLength(1);
    expect(l.strokes[0]).toHaveLength(200);
  });
});
