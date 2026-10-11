import { describe, expect, it } from "vitest";
import { defaultPipeline } from "./defaults";
import { Evaluator } from "./evaluate";
import { registry } from "./nodes";
import { makeThumb } from "./thumbs";
import type { GrayImage, RgbaImage } from "./types";

describe("makeThumb", () => {
  it("shrinks rasters to the thumbnail size and keeps the aspect ratio", () => {
    const g: GrayImage = { width: 800, height: 400, data: new Float32Array(800 * 400).fill(0.5) };
    const t = makeThumb(g, 200);
    expect(t).toMatchObject({ kind: "raster", width: 200, height: 100 });
    if (t.kind === "raster") expect([...t.data.slice(0, 4)]).toEqual([128, 128, 128, 255]);
  });

  it("keeps small images as they are and passes paths through", () => {
    const img: RgbaImage = { width: 2, height: 1, data: Uint8ClampedArray.of(1, 2, 3, 4, 5, 6, 7, 8) };
    expect(makeThumb(img)).toEqual({ kind: "raster", width: 2, height: 1, data: img.data });
    const strokes = [[{ x: 0, y: 0 }, { x: 1, y: 1 }]];
    expect(makeThumb({ width: 2, height: 2, strokes })).toMatchObject({ kind: "lines", strokes });
    expect(makeThumb({ paper: { width: 105, height: 148 }, strokes })).toMatchObject({ kind: "drawing", strokes });
  });
});

describe("defaultPipeline", () => {
  it("is fully wired and only waits for an image", () => {
    const doc = defaultPipeline(registry);
    expect(doc.nodes.map((n) => n.kind === "node" && n.type)).toEqual(["image", "grayscale", "contrast", "blur", "amplifyLine", "paper", "optimize", "output"]);
    expect(doc.edges).toHaveLength(7);
    const r = new Evaluator(registry).run(doc, { assets: new Map() });
    expect([...r.status.values()].every((s) => s.state === "waiting")).toBe(true);
    expect(r.status.get(doc.nodes[0].id)!.error).toBe("load an image");
  });
});
