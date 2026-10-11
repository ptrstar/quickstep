import { describe, expect, it } from "vitest";
import type { GrayImage } from "../types";
import { canny, gaussianBlur, traceEdges } from "./edges";
import { hatch, layerThresholds } from "./hatching";
import { strokeLength } from "./optimize";

const gray = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
};

/** Black square [20, 40) on white, 60 × 60. */
const square = () => gray(60, 60, (x, y) => (x >= 20 && x < 40 && y >= 20 && y < 40 ? 0 : 1));
const OPTS = { sigma: 1.4, high: 0.85, low: 0.4 };

describe("gaussianBlur", () => {
  it("keeps the mean brightness", () => {
    const g = square();
    const b = gaussianBlur(g, 2);
    const mean = (d: Float32Array) => d.reduce((a, v) => a + v, 0) / d.length;
    expect(mean(b.data)).toBeCloseTo(mean(g.data), 3);
  });
});

describe("canny", () => {
  it("finds the square's outline, one pixel thin, about as long as its perimeter", () => {
    const mask = canny(square(), OPTS);
    const pts: [number, number][] = [];
    mask.forEach((v, i) => v && pts.push([i % 60, Math.floor(i / 60)]));
    // every edge pixel lies on the square's boundary (between pixel 19|20 and 39|40), within 1.5 px
    for (const [x, y] of pts) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const dx = Math.max(20 - cx, 0, cx - 40);
      const dy = Math.max(20 - cy, 0, cy - 40);
      const outside = Math.hypot(dx, dy);
      const inside = Math.min(cx - 20, 40 - cx, cy - 20, 40 - cy);
      expect(dx || dy ? outside : inside).toBeLessThanOrEqual(1.5);
    }
    expect(pts.length).toBeGreaterThan(0.85 * 80);
    expect(pts.length).toBeLessThan(1.15 * 80);
  });

  it("finds nothing in a flat image, and fewer edges with a higher threshold", () => {
    expect(canny(gray(30, 30, () => 0.5), OPTS).some((v) => v)).toBe(false);
    const soft = gray(80, 80, (x, y) => 0.5 + 0.3 * Math.sin(x / 4) * Math.cos(y / 6) + (x > 40 ? 0.2 : 0));
    const n = (high: number) => canny(soft, { ...OPTS, high }).reduce((a, v) => a + v, 0);
    expect(n(0.97)).toBeLessThan(n(0.6));
  });
});

describe("traceEdges", () => {
  const mask = (w: number, h: number, pts: [number, number][]) => {
    const m = new Uint8Array(w * h);
    for (const [x, y] of pts) m[y * w + x] = 1;
    return m;
  };

  it("turns a line of pixels into one stroke, in order", () => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [i, 3]);
    const s = traceEdges(mask(12, 6, pts), 12, 6);
    expect(s).toHaveLength(1);
    expect(s[0].map((p) => p.x)).toEqual(pts.map(([x]) => x + 0.5));
  });

  it("closes loops", () => {
    const ring: [number, number][] = [];
    for (let i = 2; i <= 8; i++) ring.push([i, 2], [i, 8], [2, i], [8, i]);
    const [s] = traceEdges(mask(11, 11, ring), 11, 11);
    expect(s[0]).toEqual(s.at(-1));
  });

  it("covers every pixel of a T junction, and the branch ends on the bar", () => {
    const bar: [number, number][] = Array.from({ length: 11 }, (_, i) => [i, 1]);
    const stem: [number, number][] = Array.from({ length: 6 }, (_, i) => [5, 2 + i]);
    const strokes = traceEdges(mask(12, 10, [...bar, ...stem]), 12, 10);
    const covered = new Set(strokes.flat().map((p) => `${p.x - 0.5},${p.y - 0.5}`));
    for (const [x, y] of [...bar, ...stem]) expect(covered.has(`${x},${y}`)).toBe(true);
    expect(strokes.length).toBeLessThanOrEqual(3);
  });
});

describe("hatch", () => {
  const opts = { spacing: 4, layers: 3, angle: 0, angleStep: 90, cutoff: 0.9, minLength: 0 };

  it("thresholds are evenly spaced below the cutoff", () => {
    expect(layerThresholds(3, 0.9).map((v) => +v.toFixed(6))).toEqual([0.9, 0.6, 0.3]);
  });

  it("leaves white alone and adds layers with darker tones", () => {
    expect(hatch(gray(40, 40, () => 1), opts)).toEqual([]);
    const layersAt = (tone: number) => {
      const s = hatch(gray(40, 40, () => tone), opts);
      return new Set(s.map((st) => (Math.abs(st[1].y - st[0].y) < 1e-6 ? "h" : "v"))).size + (s.length && 0);
    };
    expect(hatch(gray(40, 40, () => 0.75), opts).every((st) => Math.abs(st[1].y - st[0].y) < 1e-6)).toBe(true); // 1 layer: horizontal
    expect(layersAt(0.5)).toBe(2); // horizontal and vertical
    expect(hatch(gray(40, 40, () => 0.1), opts).length).toBeGreaterThan(hatch(gray(40, 40, () => 0.5), opts).length);
  });

  it("hatches only where it is dark", () => {
    const half = gray(40, 40, (x) => (x < 20 ? 0 : 1));
    for (const s of hatch(half, { ...opts, layers: 1 })) for (const p of s) expect(p.x).toBeLessThanOrEqual(20.5);
  });

  it("spacing sets the number of lines", () => {
    const black = gray(40, 40, () => 0);
    const n = (spacing: number) => hatch(black, { ...opts, layers: 1, spacing }).length;
    expect(n(4)).toBe(10);
    expect(n(2)).toBe(20);
    for (const s of hatch(black, { ...opts, layers: 1 })) expect(strokeLength(s)).toBeGreaterThan(39);
  });
});
