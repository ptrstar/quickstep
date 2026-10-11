import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Stroke } from "../../geometry";
import { flatten, joinStrokes, optimizeStrokes, orderStrokes, smooth, strokeLength, travelLength } from "./optimize";

const pointArb = fc.record({ x: fc.double({ min: -100, max: 100, noNaN: true }), y: fc.double({ min: -100, max: 100, noNaN: true }) });
const strokeArb = fc.array(pointArb, { minLength: 1, maxLength: 40 });

function distanceToPolyline(p: { x: number; y: number }, line: Stroke): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return line.length === 1 ? Math.hypot(p.x - line[0].x, p.y - line[0].y) : best;
}

describe("flatten", () => {
  it("turns wiggles smaller than the tolerance into one straight line", () => {
    const wiggly = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.2, y: 0.02 * Math.sin(i * 2) }));
    expect(flatten(wiggly, 0.05, 1)).toEqual([wiggly[0], wiggly[100]]);
  });

  it("keeps the turns of real wiggles round: only near-straight flanks may lose points", () => {
    const wave = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.15, y: 0.8 * Math.sin((i * 2 * Math.PI) / 10) }));
    const out = flatten(wave, 0.1, 1);
    const turns = wave.filter((p) => Math.abs(p.y) > 0.7);
    for (const p of turns) expect(out).toContain(p);
  });

  it("every original point stays within the tolerance, endpoints kept", () => {
    fc.assert(
      fc.property(strokeArb, fc.double({ min: 0.01, max: 5, noNaN: true }), fc.double({ min: 0, max: 20, noNaN: true }), (s, tol, span) => {
        const out = flatten(s, tol, span);
        expect(out[0]).toBe(s[0]);
        expect(out.at(-1)).toBe(s.at(-1));
        for (const p of s) expect(distanceToPolyline(p, out)).toBeLessThanOrEqual(tol + 1e-9);
      }),
    );
  });
});

describe("smooth", () => {
  it("keeps the endpoints and the number of points", () => {
    fc.assert(
      fc.property(strokeArb, fc.integer({ min: 0, max: 5 }), (s, r) => {
        const out = smooth(s, r);
        expect(out).toHaveLength(s.length);
        expect(out[0]).toEqual(s[0]);
        expect(out.at(-1)).toEqual(s.at(-1));
      }),
    );
  });
});

describe("orderStrokes", () => {
  it("draws every stroke exactly once, possibly reversed, and never travels more", () => {
    fc.assert(
      fc.property(fc.array(fc.array(pointArb, { minLength: 1, maxLength: 4 }), { maxLength: 30 }), (strokes) => {
        const out = orderStrokes(strokes);
        expect(out).toHaveLength(strokes.length);
        const key = (s: Stroke) => JSON.stringify(s);
        const want = strokes.map((s) => [key(s), key([...s].reverse())]);
        const got = out.map(key);
        for (const [fwd, rev] of want) {
          const i = got.findIndex((g) => g === fwd || g === rev);
          expect(i).toBeGreaterThanOrEqual(0);
          got.splice(i, 1);
        }
        expect(travelLength(out)).toBeLessThanOrEqual(travelLength(strokes) + 1e-9);
      }),
    );
  });

  it("serpentines short strokes instead of returning to the start of each", () => {
    // the same direction each time, as a naive left-to-right generator emits them
    const rows = Array.from({ length: 10 }, (_, i) => [{ x: 0, y: i }, { x: 50, y: i }]);
    const out = orderStrokes(rows);
    expect(travelLength(out)).toBeLessThan(travelLength(rows) / 5);
  });
});

describe("joinStrokes", () => {
  it("joins strokes whose gap is small enough", () => {
    const s = [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 1.2, y: 0 }, { x: 2, y: 0 }],
      [{ x: 9, y: 0 }, { x: 10, y: 0 }],
    ];
    expect(joinStrokes(s, 0.5)).toHaveLength(2);
    expect(joinStrokes(s, 0)).toHaveLength(3);
  });
});

describe("optimizeStrokes", () => {
  it("drops strokes shorter than the minimum length", () => {
    const s = [[{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0.2, y: 0 }], [{ x: 0, y: 0 }, { x: 5, y: 0 }]];
    const out = optimizeStrokes(s, { smooth: 0, flatten: 0, minSpan: 1, minLength: 1, order: false, join: 0 });
    expect(out.map(strokeLength)).toEqual([5]);
  });
});
