import { describe, expect, it } from "vitest";
import { createNode, paramVisible } from "../doc";
import type { GrayImage, PaperDrawing } from "../types";
import { registry } from ".";
import { circleCorners, markRadius, polygon } from "./marks";

describe("polygon", () => {
  it("is closed, has the corners, all on the radius, first corner at the rotation", () => {
    const p = polygon({ x: 10, y: 5 }, 2, 6, 90);
    expect(p).toHaveLength(7);
    expect(p[0]).toEqual(p[6]);
    for (const q of p) expect(Math.hypot(q.x - 10, q.y - 5)).toBeCloseTo(2, 9);
    expect(p[0].x).toBeCloseTo(10);
    expect(p[0].y).toBeCloseTo(7);
  });
});

describe("markRadius", () => {
  const m = { shape: "circle" as const, corners: 0, rotation: 0, minRadius: 0.2, maxRadius: 1, sizes: [0, 0.25, 1] };
  it("runs from min (lightest) to max (darkest), area following the tone", () => {
    expect(markRadius(m, 0)).toBeCloseTo(0.2);
    expect(markRadius(m, 1)).toBeCloseTo(0.2 + 0.8 * 0.5);
    expect(markRadius(m, 2)).toBeCloseTo(1);
  });
  it("circles get enough corners to look round", () => {
    expect(circleCorners(0.1)).toBe(12);
    expect(circleCorners(5)).toBeGreaterThan(100);
  });
});

describe("marks on paper", () => {
  /** Stippling (circles) → Paper, on a black square image of the given resolution. */
  function radii(size: number) {
    const g: GrayImage = { width: size, height: size, data: new Float32Array(size * size) };
    const st = createNode(registry, "stipple", { x: 0, y: 0 }, { points: 50, style: "circles", maxRadius: 1, minRadius: 0.2, iterations: 0 });
    const paper = createNode(registry, "paper", { x: 0, y: 0 });
    const lines = registry.get("stipple")!.compute({ gray: g }, st.params, { assets: new Map() }).lines;
    const d = registry.get("paper")!.compute({ lines }, paper.params, { assets: new Map() }).drawing as PaperDrawing;
    return d.strokes.map((s) => {
      const cx = s.slice(1).reduce((a, p) => a + p.x, 0) / (s.length - 1);
      const cy = s.slice(1).reduce((a, p) => a + p.y, 0) / (s.length - 1);
      return Math.hypot(s[0].x - cx, s[0].y - cy);
    });
  }

  it("are drawn in mm, the same whatever the image resolution", () => {
    const small = radii(40);
    const big = radii(400);
    for (const r of [...small, ...big]) expect(r).toBeCloseTo(1, 2); // black: all at max radius
  });
});

describe("paramVisible", () => {
  const spec = { kind: "number" as const, label: "", default: 0, min: 0, max: 1, step: 1, when: { param: "style", is: ["circles", "polygons"] } };
  it("shows a control only for the listed values", () => {
    expect(paramVisible(spec, { style: "circles" })).toBe(true);
    expect(paramVisible(spec, { style: "dots" })).toBe(false);
    expect(paramVisible({ ...spec, when: { param: "style", is: "dots" } }, { style: "dots" })).toBe(true);
  });
});
