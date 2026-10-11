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
    expect(empty.cleared).toHaveLength(7);
    expect(empty.drawing).toBeUndefined();

    s.addAsset("a", image());
    doc = setParam(registry, doc, img, "asset", "a");
    const first = s.run(doc);
    expect(first.thumbs).toHaveLength(7);
    expect(first.drawing?.paper).toEqual({ width: 105, height: 148 });

    const second = s.run(setParam(registry, doc, blur, "radius", 5));
    expect(second.thumbs.map(([id]) => id)).toEqual(doc.nodes.slice(3).map((n) => n.id));
    expect(second.cleared).toEqual([]);
  });
});
