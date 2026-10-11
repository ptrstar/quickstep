import { describe, expect, it } from "vitest";
import { chain, defaultPipeline } from "./defaults";
import { disconnect, removeNodes } from "./doc";
import { registry } from "./nodes";
import { ensureOutput, isOutput } from "./output";
import { GraphSession } from "./session";

const image = () => ({ width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4).fill(90) });

describe("output knob", () => {
  it("an old graph gets one, wired to the drawing it used to plot", () => {
    const old = chain(registry, ["text", "optimize"]);
    const doc = ensureOutput(registry, old);
    const out = doc.nodes.find(isOutput)!;
    expect(doc.edges.find((e) => e.to.node === out.id)?.from.node).toBe(old.nodes[1].id);
    expect(ensureOutput(registry, doc)).toBe(doc); // already fine: unchanged
  });

  it("keeps exactly one", () => {
    const doc = defaultPipeline(registry);
    const twice = { ...doc, nodes: [...doc.nodes, { ...doc.nodes.find(isOutput)!, id: "second" }] };
    expect(ensureOutput(registry, twice).nodes.filter(isOutput)).toHaveLength(1);
  });

  it("only the drawing wired into it is plotted", () => {
    const s = new GraphSession(registry);
    s.addAsset("i", image());
    let doc = defaultPipeline(registry);
    doc = { ...doc, nodes: doc.nodes.map((n) => (n.kind === "node" && n.type === "image" ? { ...n, params: { ...n.params, asset: "i" } } : n)) };
    expect(s.run(doc).drawing?.strokes.length).toBeGreaterThan(0);
    const out = doc.nodes.find(isOutput)!;
    expect(s.run(disconnect(doc, { node: out.id, port: "drawing" })).drawing).toBeUndefined();
    // a second, unconnected drawing does not take over
    const extra = chain(registry, ["text"]).nodes[0];
    expect(s.run(disconnect({ ...doc, nodes: [...doc.nodes, extra] }, { node: out.id, port: "drawing" })).drawing).toBeUndefined();
    expect(ensureOutput(registry, removeNodes(doc, [out.id])).nodes.filter(isOutput)).toHaveLength(1);
  });
});
