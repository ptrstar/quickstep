import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Stroke } from "../../geometry";
import { parseSvgFont } from "../../text/font";
import { createNode } from "../doc";
import type { GrayImage, PaperDrawing } from "../types";
import { registry } from ".";
import { repeat } from "./generative";
import { BLEND_MODES, combine, crop, gradient, levels, orient, posterize, sharpen, threshold } from "./grayops";
import { labelOutline, snowflake } from "./labels";
import { shapeStrokes, transformStrokes } from "./shapes";

const flat = (w: number, h: number, v: number): GrayImage => ({ width: w, height: h, data: new Float32Array(w * h).fill(v) });
const img = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
};
const font = parseSvgFont(readFileSync(new URL("../../../../public/fonts/EMSReadability.svg", import.meta.url), "utf8"));

describe("gray operations", () => {
  it("combine: every mode on constant images", () => {
    const want: Record<string, number> = { add: 1, subtract: 0.4, multiply: 0.21, screen: 0.79, difference: 0.4, darken: 0.3, lighten: 0.7, average: 0.5 };
    for (const mode of BLEND_MODES) expect(combine(flat(2, 2, 0.7), flat(2, 2, 0.3), mode).data[0], mode).toBeCloseTo(want[mode], 6);
  });

  it("combine: B is resized to A, mix fades between A and the result", () => {
    const left = img(2, 1, (x) => (x === 0 ? 0 : 1)); // left half black
    const r = combine(flat(8, 4, 1), left, "multiply");
    expect(r.width).toBe(8);
    expect(r.data[0]).toBeCloseTo(0);
    expect(r.data[7]).toBeCloseTo(1);
    expect(combine(flat(2, 2, 0.8), flat(2, 2, 0.2), "subtract", 0).data[0]).toBeCloseTo(0.8);
  });

  it("levels, threshold, posterize", () => {
    const ramp = img(5, 1, (x) => x / 4); // 0 .25 .5 .75 1
    expect([...levels(ramp, 0.25, 0.75, 1).data].map((v) => +v.toFixed(3))).toEqual([0, 0, 0.5, 1, 1]);
    expect(levels(flat(1, 1, 0.25), 0, 1, 2).data[0]).toBeCloseTo(0.5); // gamma 2 lightens
    expect([...threshold(ramp, 0.5).data]).toEqual([0, 0, 1, 1, 1]);
    expect([...posterize(ramp, 2).data]).toEqual([0, 0, 1, 1, 1]);
  });

  it("sharpen raises contrast across an edge", () => {
    const edge = img(20, 1, (x) => (x < 10 ? 0.3 : 0.7));
    const s = sharpen(edge, 1, 2).data;
    expect(s[9]).toBeLessThan(0.3);
    expect(s[10]).toBeGreaterThan(0.7);
  });

  it("crop and orient move pixels where expected", () => {
    const g = img(4, 2, (x, y) => y * 4 + x); // 0..7
    const c = crop(g, 0.25, 0, 0.25, 0.5);
    expect([c.width, c.height, ...c.data]).toEqual([2, 1, 1, 2]);
    const r = orient(g, 1, false); // 90° clockwise: 2 × 4, top-left was bottom-left
    expect([r.width, r.height, r.data[0], r.data[1]]).toEqual([2, 4, 4, 0]);
    expect(orient(g, 0, true).data[0]).toBe(3);
    expect([...orient(orient(g, 1, false), 3, false).data]).toEqual([...g.data]);
  });

  it("gradient runs from `from` to `to`", () => {
    const lin = gradient(100, 10, "linear", 0, 1, 0);
    expect(lin.data[0]).toBeGreaterThan(0.98);
    expect(lin.data[99]).toBeLessThan(0.02);
    const rad = gradient(51, 51, "radial", 0, 1, 0);
    expect(rad.data[25 * 51 + 25]).toBeGreaterThan(0.98);
    expect(rad.data[0]).toBeLessThan(0.02);
  });
});

describe("shapes", () => {
  const box = { shape: "rectangle" as const, x: 10, y: 20, width: 50, height: 30, radius: 5, corners: 6, rotation: 0, copies: 3, spacing: 2 };
  const bounds = (s: Stroke) => ({ x0: Math.min(...s.map((p) => p.x)), x1: Math.max(...s.map((p) => p.x)), y0: Math.min(...s.map((p) => p.y)), y1: Math.max(...s.map((p) => p.y)) });

  it("a frame of inset copies, each closed and `spacing` further inside", () => {
    const s = shapeStrokes(box);
    expect(s).toHaveLength(3);
    s.forEach((st, k) => {
      expect(st[0]).toEqual(st.at(-1));
      expect(bounds(st)).toEqual({ x0: 10 + 2 * k, x1: 60 - 2 * k, y0: 20 + 2 * k, y1: 50 - 2 * k });
    });
  });

  it("rounded rectangles, ellipses and polygons stay in their box; rotation keeps the centre", () => {
    for (const shape of ["rounded", "ellipse", "polygon"] as const) {
      const b = bounds(shapeStrokes({ ...box, shape, copies: 1 })[0]);
      expect(b.x0).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(b.x1).toBeLessThanOrEqual(60 + 1e-9);
    }
    const r = bounds(shapeStrokes({ ...box, copies: 1, rotation: 90 })[0]);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(35);
    expect(r.x1 - r.x0).toBeCloseTo(30);
  });

  it("transform moves, scales, rotates and mirrors around the drawing's centre", () => {
    const s = [[{ x: 0, y: 0 }, { x: 10, y: 0 }]];
    expect(transformStrokes(s, { dx: 5, dy: 1, scale: 1, rotate: 0, mirror: "none" })[0][0]).toEqual({ x: 5, y: 1 });
    const turned = transformStrokes(s, { dx: 0, dy: 0, scale: 2, rotate: 90, mirror: "none" })[0];
    expect(turned[0].x).toBeCloseTo(5);
    expect(turned[0].y).toBeCloseTo(-10);
    expect(transformStrokes(s, { dx: 0, dy: 0, scale: 1, rotate: 0, mirror: "horizontal" })[0][0].x).toBeCloseTo(10);
  });
});

describe("repeat with randomness", () => {
  const lines = { width: 10, height: 10, strokes: [[{ x: 10, y: 5 }]] };
  it("without randomness nothing changes, and the same seed gives the same copies", () => {
    expect(repeat(lines, { copies: 5, rotate: 30, scale: 1, jitter: 0, jitterTurn: 0, jitterScale: 0, seed: 3 })).toEqual(repeat(lines, { copies: 5, rotate: 30, scale: 1 }));
    const a = repeat(lines, { copies: 5, rotate: 0, scale: 1, jitter: 0.1, jitterTurn: 20, jitterScale: 0.2, seed: 3 });
    expect(repeat(lines, { copies: 5, rotate: 0, scale: 1, jitter: 0.1, jitterTurn: 20, jitterScale: 0.2, seed: 3 })).toEqual(a);
    expect(new Set(a.strokes.map((s) => s[0].x.toFixed(6))).size).toBe(5); // copies really moved apart
  });
});

describe("snowflake", () => {
  const key = (s: Stroke[]) => new Set(s.flat().map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
  it("has six-fold symmetry: turning it by 60° gives the same points", () => {
    const f = snowflake({ branches: 3, detail: 2, seed: 4 });
    const a = Math.PI / 3;
    const turned = f.map((s) => s.map((p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) })));
    const k = key(f);
    for (const p of key(turned)) expect(k.has(p.replace("-0.0000", "0.0000"))).toBe(true);
  });

  it("every seed grows a different flake, within radius about 1.1", () => {
    const flakes = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(snowflake({ branches: 3, detail: 2, seed })));
    expect(new Set(flakes).size).toBe(5);
    for (const p of snowflake({ branches: 6, detail: 2, seed: 9 }).flat()) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1.21);
  });
});

describe("Cookie labels", () => {
  const run = (params: Record<string, string | number | boolean> = {}) => {
    const n = createNode(registry, "cookieLabels", { x: 0, y: 0 }, params);
    return registry.get("cookieLabels")!.compute({}, n.params, { assets: new Map(), fonts: new Map([["ems-readability", font]]) }).drawing as PaperDrawing;
  };

  it("the outline is a rectangle with the top-left corner cut diagonally", () => {
    expect(labelOutline(70, 32, 10)).toEqual([
      { x: 10, y: 0 },
      { x: 70, y: 0 },
      { x: 70, y: 32 },
      { x: 0, y: 32 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]);
  });

  it("places one label per name inside the sheet, each with its own snowflake", () => {
    const d = run({ names: "Anna\nBen\nClara\nDavid" });
    expect(d.paper).toEqual({ width: 105, height: 148 });
    for (const p of d.strokes.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(105);
      expect(p.y).toBeLessThanOrEqual(148);
    }
    const outlines = d.strokes.filter((s) => s.length === 6 && s[0].x === s[5].x && s[0].y === s[5].y);
    expect(outlines).toHaveLength(4);
    expect(d.notes).toEqual([]);
    // the snowflakes differ: compare the strokes right of each label's middle, relative to the label
    const flakeOf = (i: number) => {
      const o = outlines[i];
      const x0 = Math.min(...o.map((p) => p.x));
      const y0 = Math.min(...o.map((p) => p.y));
      return JSON.stringify(
        d.strokes
          .filter((s) => s.every((p) => p.x > x0 + 45 && p.x < x0 + 70 && p.y > y0 && p.y < y0 + 32) && s.length <= 7)
          .map((s) => s.map((p) => [+(p.x - x0).toFixed(2), +(p.y - y0).toFixed(2)])),
      );
    };
    expect(new Set([0, 1, 2, 3].map(flakeOf)).size).toBe(4);
  });

  it("says when names do not fit, and the name shrinks to fit its space", () => {
    const d = run({ names: "A\nB\nC\nD\nE\nF" });
    expect(d.notes).toEqual(["2 of 6 names do not fit on this sheet (4 labels)"]);
    const long = run({ names: "Maximilian Alexander", snowflake: false, hole: false });
    for (const p of long.strokes.flat()) expect(p.x).toBeLessThanOrEqual(4 + 70);
  });
});
