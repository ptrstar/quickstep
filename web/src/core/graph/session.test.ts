import { describe, expect, it } from "vitest";
import { defaultPipeline } from "./defaults";
import { setParam } from "./doc";
import { registry } from "./nodes";
import { GraphSession } from "./session";

const image = () => {
  const data = new Uint8ClampedArray(40 * 30 * 4).fill(255);
  for (let i = 0; i < 40 * 15; i++) data.set([0, 0, 0, 255], i * 4); // top half black
  return { width: 40, height: 30, data };
};

describe("GraphSession", () => {
  it("sends thumbnails only for recomputed nodes, and the paper drawing", () => {
    const s = new GraphSession(registry);
    let doc = defaultPipeline(registry);
    const [img, , , blur] = doc.nodes.map((n) => n.id);
    const empty = s.run(doc);
    expect(empty.thumbs).toEqual([]);
    expect(empty.cleared).toHaveLength(7); // not the output knob: it never has a thumbnail
    expect(empty.drawing).toBeUndefined();

    s.addAsset("a", image());
    doc = setParam(registry, doc, img, "asset", "a");
    const first = s.run(doc);
    expect(first.thumbs).toHaveLength(7);
    expect(first.drawing?.paper).toEqual({ width: 105, height: 148 });

    const second = s.run(setParam(registry, doc, blur, "radius", 5));
    expect(second.thumbs.map(([id]) => id)).toEqual(doc.nodes.slice(3, 7).map((n) => n.id));
    expect(second.cleared).toEqual([]);
  });
});

describe("GraphSession fonts", () => {
  it("replacing a font under the same key recomputes the text", async () => {
    const { parseSvgFont } = await import("../text/font");
    const { createNode } = await import("./doc");
    const font = (adv: number) =>
      parseSvgFont(`<svg><font horiz-adv-x="500"><font-face font-family="T" units-per-em="1000" ascent="800" descent="-200"/><glyph unicode="i" horiz-adv-x="${adv}" d="M 0 0 L 0 500"/></font></svg>`);
    const s = new GraphSession(registry);
    const t = createNode(registry, "text", { x: 0, y: 0 }, { text: "ii", font: "hand:mine", width: 0 });
    const doc = { nodes: [t], edges: [] };
    s.addFont("hand:mine", font(200));
    const before = s.run(doc).thumbs[0][1];
    s.addFont("hand:mine", font(600));
    const after = s.run(doc).thumbs.find(([id]) => id === t.id)?.[1];
    expect(after).toBeDefined(); // recomputed, not served from the cache
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });
});
