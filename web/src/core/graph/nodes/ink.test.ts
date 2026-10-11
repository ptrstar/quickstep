import { describe, expect, it } from "vitest";
import { inkDrawing } from "../defaults";
import { createNode, type GraphDoc, setParam } from "../doc";
import { Evaluator } from "../evaluate";
import { GraphSession } from "../session";
import type { GrayImage, Lines } from "../types";
import { registry } from ".";
import { distanceTransform, rasterize } from "./ink";

describe("distanceTransform", () => {
  it("is within 8 % of the true distance to the nearest marked pixel", () => {
    const w = 41;
    const mask = new Uint8Array(w * w);
    mask[20 * w + 20] = 1;
    const d = distanceTransform(mask, w, w);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const true_ = Math.hypot(x - 20, y - 20);
        expect(Math.abs(d[y * w + x] - true_)).toBeLessThanOrEqual(0.08 * true_ + 1e-6);
      }
    }
  });

  it("rasterize marks the pixels a line passes through", () => {
    const m = rasterize([[{ x: 0.5, y: 2.5 }, { x: 9.5, y: 2.5 }]], 10, 5);
    expect([...m.slice(20, 30)]).toEqual(Array(10).fill(1));
    expect(m.reduce((a, v) => a + v, 0)).toBe(10);
  });
});

describe("Ink drawing node", () => {
  const black: GrayImage = { width: 40, height: 40, data: new Float32Array(1600) };
  const outline = [[{ x: 20.5, y: 0 }, { x: 20.5, y: 40 }]];

  function run(outlines: Lines, params: Record<string, number | boolean> = {}) {
    const ink = createNode(registry, "ink", { x: 0, y: 0 }, { layers: 1, angle: 0, lines: 10, ...params });
    const def = registry.get("ink")!;
    return def.compute({ tone: black, outlines }, ink.params, { assets: new Map() }).lines as Lines;
  }

  it("keeps hatching a gap away from the outlines, and draws the outlines", () => {
    const out = run({ width: 40, height: 40, strokes: outline }, { gap: 3 });
    expect(out.strokes[0]).toEqual(outline[0]);
    const hatchPoints = out.strokes.slice(1).flat();
    expect(hatchPoints.length).toBeGreaterThan(0);
    for (const p of hatchPoints) expect(Math.abs(p.x - 20.5)).toBeGreaterThan(2.5);
  });

  it("without a gap the hatching runs through, and outlines can be left out", () => {
    const out = run({ width: 40, height: 40, strokes: outline }, { gap: 0, drawOutlines: false });
    expect(out.strokes).toHaveLength(10); // one full-width line per row, nothing cut
  });

  it("scales outlines from another frame onto the tone image", () => {
    const out = run({ width: 80, height: 80, strokes: [[{ x: 41, y: 0 }, { x: 41, y: 80 }]] }, { gap: 3 });
    expect(out.strokes[0][0].x).toBeCloseTo(20.5);
  });

  it("the preset wires grayscale into both outlines and tone, and plots", () => {
    const s = new GraphSession(registry);
    const data = new Uint8ClampedArray(60 * 60 * 4);
    for (let i = 0; i < 3600; i++) {
      const x = i % 60;
      const y = Math.floor(i / 60);
      const v = Math.hypot(x - 30, y - 30) < 15 ? 40 : 230;
      data.set([v, v, v, 255], i * 4);
    }
    s.addAsset("disc", { width: 60, height: 60, data });
    let doc: GraphDoc = inkDrawing(registry);
    doc = setParam(registry, doc, doc.nodes[0].id, "asset", "disc");
    const r = s.run(doc);
    expect(r.status.filter(([, st]) => st.state !== "ok")).toEqual([]);
    expect(r.drawing!.strokes.length).toBeGreaterThan(10);
    expect(new Evaluator(registry).run(doc, { assets: new Map() }).status.size).toBeGreaterThan(0);
  });
});
