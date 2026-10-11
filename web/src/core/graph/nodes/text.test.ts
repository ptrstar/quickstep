import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSvgFont } from "../../text/font";
import { connect, createNode, type GraphDoc, setParam } from "../doc";
import { Evaluator } from "../evaluate";
import { parsePreset, toPreset } from "../preset";
import type { PaperDrawing } from "../types";
import { registry } from ".";
import { POSTCARD, postcardStrokes } from "./text";

const font = parseSvgFont(readFileSync(new URL("../../../../public/fonts/EMSReadability.svg", import.meta.url), "utf8"));
const fonts = new Map([["ems-readability", font]]);
const ctx = { assets: new Map(), fonts };

const run = (doc: GraphDoc, ev = new Evaluator(registry), c = ctx) => ev.run(doc, c);
const drawing = (doc: GraphDoc, id: string) => run(doc).outputs.get(id)?.drawing as PaperDrawing;
const bounds = (d: PaperDrawing) => {
  const pts = d.strokes.flat();
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
};

describe("Text node", () => {
  it("draws the text inside its box on the chosen sheet", () => {
    const t = createNode(registry, "text", { x: 0, y: 0 }, { text: "Hallo Zürich", x: 20, y: 30, width: 0 });
    const d = drawing({ nodes: [t], edges: [] }, t.id);
    expect(d.paper).toEqual({ width: 105, height: 148 });
    const b = bounds(d);
    expect(b.x0).toBeGreaterThanOrEqual(20);
    expect(b.y0).toBeGreaterThanOrEqual(30);
    expect(b.y1).toBeLessThanOrEqual(30 + 6 * (font.ascent + font.descent));
    expect(d.notes).toEqual([]);
  });

  it("wraps at the box width", () => {
    const t = createNode(registry, "text", { x: 0, y: 0 }, { text: "one two three four five six seven", x: 10, width: 30 });
    const b = bounds(drawing({ nodes: [t], edges: [] }, t.id));
    expect(b.x1).toBeLessThanOrEqual(40 + 1e-9);
    expect(b.y1 - b.y0).toBeGreaterThan(2 * 6 * 1.3);
  });

  it("waits for its font and recovers once it is there", () => {
    const t = createNode(registry, "text", { x: 0, y: 0 });
    const doc = { nodes: [t], edges: [] };
    const ev = new Evaluator(registry);
    expect(run(doc, ev, { assets: new Map(), fonts: new Map() }).status.get(t.id)).toMatchObject({ state: "waiting", error: "loading font" });
    expect(run(doc, ev).status.get(t.id)!.state).toBe("ok");
  });

  it("reports characters the font lacks", () => {
    const t = createNode(registry, "text", { x: 0, y: 0 }, { text: "snow ☃" });
    expect(drawing({ nodes: [t], edges: [] }, t.id).notes).toEqual(["font lacks ☃"]);
  });

  it("presets keep built-in fonts and drop loaded ones", () => {
    const a = createNode(registry, "text", { x: 0, y: 0 }, { font: "ems-tech" });
    const b = createNode(registry, "text", { x: 0, y: 0 }, { font: "font:Mine.ttf#x" });
    const { preset } = parsePreset(registry, JSON.parse(JSON.stringify(toPreset(registry, "p", { nodes: [a, b], edges: [] }))));
    const fontsIn = preset.graph.nodes.map((n) => n.kind === "node" && n.params.font);
    expect(fontsIn).toEqual(["ems-tech", "ems-readability"]);
  });
});

describe("Postcard back", () => {
  const params = {
    message: "Liebe Grüsse aus Zürich! Bis bald, und viel Spass mit dem Plotter.",
    address: "Anna Muster\nBahnhofstrasse 1\n8001 Zürich\nSchweiz",
    textSize: 4.5,
    lineHeight: 1.45,
    addressSize: 5,
    divider: true,
    stamp: true,
    addressLines: true,
  };

  it("lays out an A6 landscape card with everything inside the sheet", () => {
    const d = postcardStrokes(params, font);
    expect(d.paper).toEqual({ width: 148, height: 105 });
    const b = bounds(d);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThanOrEqual(148);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.y1).toBeLessThanOrEqual(105);
    expect(d.notes).toEqual([]); // ü and all others exist
  });

  it("keeps the message left of the divider", () => {
    const d = postcardStrokes({ ...params, divider: false, stamp: false, addressLines: false, address: "" }, font);
    expect(bounds(d).x1).toBeLessThan(POSTCARD.divider.x);
  });

  it("divider, stamp box and address lines can be switched off", () => {
    const all = postcardStrokes(params, font).strokes.length;
    const none = postcardStrokes({ ...params, divider: false, stamp: false, addressLines: false }, font).strokes.length;
    expect(all - none).toBe(1 + 1 + POSTCARD.address.baselines.length);
  });
});

describe("Merge node", () => {
  it("puts both drawings on A's sheet, A's strokes first", () => {
    const a = createNode(registry, "text", { x: 0, y: 0 }, { text: "A" });
    const b = createNode(registry, "text", { x: 0, y: 0 }, { text: "BB", orientation: "landscape" });
    const m = createNode(registry, "merge", { x: 0, y: 0 });
    let doc: GraphDoc = { nodes: [a, b, m], edges: [] };
    for (const [src, port] of [[a, "a"], [b, "b"]] as const) {
      const r = connect(registry, doc, { node: src.id, port: "drawing" }, { node: m.id, port });
      if (!r.ok) throw new Error(r.reason);
      doc = r.doc;
    }
    const r = run(doc);
    const da = r.outputs.get(a.id)!.drawing as PaperDrawing;
    const db = r.outputs.get(b.id)!.drawing as PaperDrawing;
    const dm = r.outputs.get(m.id)!.drawing as PaperDrawing;
    expect(dm.paper).toEqual(da.paper);
    expect(dm.strokes).toEqual([...da.strokes, ...db.strokes]);
    expect(dm.notes).toEqual(["sheets differ, using A's 105 × 148"]);
    const same = run(setParam(registry, doc, b.id, "orientation", "portrait"));
    expect((same.outputs.get(m.id)!.drawing as PaperDrawing).notes).toEqual([]);
  });
});
