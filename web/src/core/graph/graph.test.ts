import { describe, expect, it } from "vitest";
import { addNode, connect, createNode, type GraphDoc, normalizeParams, setParam, topoOrder, updateNode } from "./doc";
import { Evaluator, valueAt } from "./evaluate";
import { flatten, groupNodes, ungroup } from "./group";
import { registry } from "./nodes";
import { parseBlock, parsePreset, PresetError, toBlock, toPreset } from "./preset";
import type { Assets, Lines, PaperDrawing, RgbaImage } from "./types";

/** A 60 × 40 image: dark disc on white. */
function portrait(): RgbaImage {
  const w = 60;
  const h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.hypot(x - 30, y - 20) < 12 ? 20 : 240;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}
const assets: Assets = new Map([["face", portrait()]]);

/** image → grayscale → contrast → blur → amplifyLine → paper, wired. */
function pipeline() {
  const names = ["image", "grayscale", "contrast", "blur", "amplifyLine", "paper"] as const;
  const nodes = names.map((t, i) => createNode(registry, t, { x: i * 200, y: 0 }, t === "image" ? { asset: "face" } : {}));
  let doc: GraphDoc = { nodes, edges: [] };
  const ports = [["image", "image"], ["gray", "gray"], ["gray", "gray"], ["gray", "gray"], ["lines", "lines"]];
  ports.forEach(([out, inp], i) => {
    const r = connect(registry, doc, { node: nodes[i].id, port: out }, { node: nodes[i + 1].id, port: inp });
    if (!r.ok) throw new Error(r.reason);
    doc = r.doc;
  });
  const id = Object.fromEntries(names.map((n, i) => [n, nodes[i].id])) as Record<(typeof names)[number], string>;
  return { doc, id };
}

const drawingOf = (doc: GraphDoc, ev = new Evaluator(registry)) => {
  const r = ev.run(doc, { assets });
  const paper = r.flat.nodes.find((n) => n.type === "paper")!;
  return r.outputs.get(paper.id)?.drawing as PaperDrawing | undefined;
};

describe("graph document", () => {
  it("normalizes params: defaults, clamping, unknown keys dropped", () => {
    const specs = registry.get("blur")!.params;
    expect(normalizeParams(specs, { radius: 99, junk: 1 } as never)).toEqual({ radius: 30 });
    expect(normalizeParams(specs, {})).toEqual({ radius: 2 });
  });

  it("refuses mismatched types and loops, and replaces a wire into a taken input", () => {
    const { doc, id } = pipeline();
    expect(connect(registry, doc, { node: id.image, port: "image" }, { node: id.blur, port: "gray" })).toMatchObject({ ok: false });
    expect(connect(registry, doc, { node: id.blur, port: "gray" }, { node: id.contrast, port: "gray" })).toMatchObject({ ok: false, reason: "would make a loop" });
    const r = connect(registry, doc, { node: id.grayscale, port: "gray" }, { node: id.blur, port: "gray" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.edges.filter((e) => e.to.node === id.blur)).toHaveLength(1);
  });

  it("orders nodes after their inputs", () => {
    const { doc, id } = pipeline();
    const order = topoOrder(doc);
    expect(order.indexOf(id.image)).toBeLessThan(order.indexOf(id.blur));
    expect(order.indexOf(id.amplifyLine)).toBeLessThan(order.indexOf(id.paper));
  });
});

describe("Evaluator", () => {
  it("runs the whole pipeline into a drawing on A6 inside the margin", () => {
    const d = drawingOf(pipeline().doc)!;
    expect(d.paper).toEqual({ width: 105, height: 148 });
    expect(d.strokes).toHaveLength(40);
    for (const p of d.strokes.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(99 + 1e-9);
    }
  });

  it("recomputes only what changed", () => {
    const { doc, id } = pipeline();
    const ev = new Evaluator(registry);
    ev.run(doc, { assets });
    const again = ev.run(doc, { assets });
    expect([...again.status.values()].every((s) => !s.fresh)).toBe(true);
    const changed = ev.run(setParam(registry, doc, id.blur, "radius", 4), { assets });
    const fresh = (n: string) => changed.status.get(n)!.fresh;
    expect([fresh(id.image), fresh(id.grayscale), fresh(id.contrast)]).toEqual([false, false, false]);
    expect([fresh(id.blur), fresh(id.amplifyLine), fresh(id.paper)]).toEqual([true, true, true]);
  });

  it("waits for a missing image instead of failing", () => {
    const { doc, id } = pipeline();
    const r = new Evaluator(registry).run(setParam(registry, doc, id.image, "asset", ""), { assets });
    expect(r.status.get(id.image)).toMatchObject({ state: "waiting", error: "load an image" });
    expect(r.status.get(id.paper)!.state).toBe("waiting");
  });

  it("bypass passes the input through", () => {
    const { doc, id } = pipeline();
    const bypassed = updateNode(doc, id.contrast, (n) => ({ ...n, bypass: true }));
    const r = new Evaluator(registry).run(bypassed, { assets });
    expect(r.status.get(id.contrast)!.state).toBe("bypassed");
    expect(r.outputs.get(id.contrast)!.gray).toBe(r.outputs.get(id.grayscale)!.gray);
  });

  it("reports summaries for the cards", () => {
    const { doc, id } = pipeline();
    const r = new Evaluator(registry).run(doc, { assets });
    expect(r.status.get(id.image)!.summary).toBe("60 × 40 px");
    expect(r.status.get(id.amplifyLine)!.summary).toMatch(/^40 lines · /);
    expect(r.status.get(id.paper)!.summary).toMatch(/m ink · 40 strokes$/);
  });
});

describe("AmplifyLine and Paper", () => {
  it("lines stay straight on white and wiggle by up to amplitude × spacing on black", () => {
    const { doc, id } = pipeline();
    const ev = new Evaluator(registry);
    const r = ev.run(doc, { assets });
    const lines = valueAt(doc, r, { node: id.amplifyLine, port: "lines" }) as Lines;
    const spacing = 40 / 40;
    const top = lines.strokes[0]; // through white
    expect(Math.max(...top.map((p) => Math.abs(p.y - 0.5 * spacing)))).toBeLessThan(0.05);
    const middle = lines.strokes[20];
    const dev = Math.max(...middle.map((p) => Math.abs(p.y - 20.5 * spacing)));
    expect(dev).toBeGreaterThan(0.3 * spacing);
    expect(dev).toBeLessThanOrEqual(0.45 * spacing + 1e-9);
    // alternate direction: odd lines run right to left
    expect(lines.strokes[1][0].x).toBeGreaterThan(lines.strokes[1].at(-1)!.x);
  });

  it("landscape paper swaps width and height, and the drawing is centred", () => {
    const { doc, id } = pipeline();
    const d = drawingOf(setParam(registry, doc, id.paper, "orientation", "landscape"))!;
    expect(d.paper).toEqual({ width: 148, height: 105 });
    const xs = d.strokes.flat().map((p) => p.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(74, 0);
  });
});

describe("groups", () => {
  it("exposes the boundary ports and gives the same drawing", () => {
    const { doc, id } = pipeline();
    const { doc: grouped, id: g } = groupNodes(registry, doc, [id.grayscale, id.contrast, id.blur], "Tone");
    const group = grouped.nodes.find((n) => n.id === g)!;
    expect(group.kind).toBe("group");
    if (group.kind !== "group") return;
    expect(group.inputs.map((p) => [p.name, p.type])).toEqual([["image", "image"]]);
    expect(group.outputs.map((p) => [p.name, p.type])).toEqual([["gray", "gray"]]);
    expect(grouped.nodes).toHaveLength(4);
    expect(drawingOf(grouped)).toEqual(drawingOf(doc));
  });

  it("exposes unconnected inputs and unused outputs too", () => {
    const { doc, id } = pipeline();
    const { doc: g1, id: g } = groupNodes(registry, doc, [id.blur]);
    const disconnected = { ...g1, edges: g1.edges.filter((e) => e.to.node !== g && e.from.node !== g) };
    const { doc: g2 } = groupNodes(registry, disconnected, [g]);
    const outer = g2.nodes.find((n) => n.kind === "group")!;
    if (outer.kind !== "group") return;
    expect(outer.inputs).toHaveLength(1);
    expect(outer.outputs).toHaveLength(1);
  });

  it("nested groups flatten and evaluate like the plain graph", () => {
    const { doc, id } = pipeline();
    const inner = groupNodes(registry, doc, [id.contrast, id.blur], "Inner");
    const outer = groupNodes(registry, inner.doc, [id.grayscale, inner.id], "Outer");
    expect(flatten(outer.doc).nodes).toHaveLength(6);
    expect(drawingOf(outer.doc)).toEqual(drawingOf(doc));
    const r = new Evaluator(registry).run(outer.doc, { assets });
    expect(r.status.get(outer.id)!.state).toBe("ok");
    expect(r.status.get(`${outer.id}/${inner.id}`)!.state).toBe("ok");
  });

  it("ungroup restores the original wiring", () => {
    const { doc, id } = pipeline();
    const { doc: grouped, id: g } = groupNodes(registry, doc, [id.grayscale, id.contrast, id.blur]);
    const back = ungroup(grouped, g);
    const key = (d: GraphDoc) => d.edges.map((e) => `${e.from.node}.${e.from.port}>${e.to.node}.${e.to.port}`).sort();
    expect(key(back)).toEqual(key(doc));
    expect(back.nodes.map((n) => n.id).sort()).toEqual(doc.nodes.map((n) => n.id).sort());
  });
});

describe("presets and blocks", () => {
  it("round-trip through JSON without the loaded image", () => {
    const { doc, id } = pipeline();
    const json = JSON.parse(JSON.stringify(toPreset(registry, "Portrait waves", doc)));
    const { preset, warnings } = parsePreset(registry, json);
    expect(warnings).toEqual([]);
    expect(preset.name).toBe("Portrait waves");
    const image = preset.graph.nodes.find((n) => n.id === id.image)!;
    expect(image.kind === "node" && image.params.asset).toBe("");
    expect(preset.graph.edges).toEqual(doc.edges);
  });

  it("rejects unknown node types and drops wires that do not fit", () => {
    const { doc } = pipeline();
    const bad = JSON.parse(JSON.stringify(toPreset(registry, "x", doc)));
    bad.graph.edges.push({ from: { node: bad.graph.nodes[0].id, port: "image" }, to: { node: bad.graph.nodes[3].id, port: "gray" } });
    expect(parsePreset(registry, bad).warnings).toHaveLength(1);
    bad.graph.nodes[0].type = "nope";
    expect(() => parsePreset(registry, bad)).toThrow(PresetError);
    expect(() => parsePreset(registry, { format: "other" })).toThrow(PresetError);
  });

  it("blocks keep a group and can be added to another graph", () => {
    const { doc, id } = pipeline();
    const { doc: grouped, id: g } = groupNodes(registry, doc, [id.contrast, id.blur], "Tone");
    const group = grouped.nodes.find((n) => n.id === g)!;
    if (group.kind !== "group") return;
    const { block } = parseBlock(registry, JSON.parse(JSON.stringify(toBlock(registry, group))));
    expect(block.group.inputs).toEqual(group.inputs);
    const added = addNode({ nodes: [], edges: [] }, block.group);
    expect(flatten(added).nodes).toHaveLength(2);
  });
});

describe("node catalogue", () => {
  it("every node in the add menu has a section and a description", async () => {
    const { NODE_DEFS, CATEGORIES } = await import("./nodes");
    for (const d of NODE_DEFS.filter((n) => !n.hidden)) {
      expect(CATEGORIES as readonly string[], d.type).toContain(d.category);
      expect(d.description.length, d.type).toBeGreaterThan(10);
    }
  });
});
