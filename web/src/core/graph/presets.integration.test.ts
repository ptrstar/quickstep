import { describe, expect, it } from "vitest";
import { compile } from "../quickstep/compile";
import { DEFAULT_PARAMS } from "../quickstep/params";
import { simulate, stats } from "../sim/simulate";
import { crosshatch, defaultPipeline, edgeSketch } from "./defaults";
import { type GraphDoc, setParam, updateNode } from "./doc";
import { registry } from "./nodes";
import { travelLength } from "./nodes/optimize";
import { GraphSession } from "./session";

/** Portrait stand-in: shaded head with eyes and a mouth, darker shoulders, light background gradient. */
function portrait() {
  const w = 240;
  const h = 320;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const head = ((x - 120) / 60) ** 2 + ((y - 120) / 80) ** 2;
      const body = ((x - 120) / 110) ** 2 + ((y - 330) / 100) ** 2;
      const eye = Math.min(Math.hypot(x - 98, y - 105), Math.hypot(x - 142, y - 105)) < 9;
      const mouth = Math.abs(y - 160 - 0.004 * (x - 120) ** 2) < 3 && Math.abs(x - 120) < 25;
      const v = eye || mouth ? 30 : head < 1 ? 150 + 40 * head : body < 1 ? 50 : 230 - 0.2 * y;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

function withImage(doc: GraphDoc) {
  const img = doc.nodes.find((n) => n.kind === "node" && n.type === "image")!;
  return setParam(registry, doc, img.id, "asset", "p");
}

describe.each([
  ["Edge sketch", edgeSketch],
  ["Crosshatch", crosshatch],
  ["Portrait waves", defaultPipeline],
])("%s preset", (name, make) => {
  it("plots the portrait inside the sheet, and Optimize shortens the travel", () => {
    const s = new GraphSession(registry);
    s.addAsset("p", portrait());
    const doc = withImage(make(registry));
    const r = s.run(doc);
    expect(r.status.filter(([, st]) => st.state === "error" || st.state === "waiting")).toEqual([]);
    const d = r.drawing!;
    expect(d.strokes.length).toBeGreaterThanOrEqual(4);
    for (const p of d.strokes.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(d.paper.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(d.paper.height);
    }
    const opt = doc.nodes.find((n) => n.kind === "node" && n.type === "optimize")!.id;
    const raw = s.run(updateNode(doc, opt, (n) => ({ ...n, bypass: true }))).drawing!;
    const sim = simulate(compile(d.strokes, DEFAULT_PARAMS), DEFAULT_PARAMS);
    console.info(
      `${name}: ${d.strokes.length} strokes, ${Math.round(sim.duration)} s, travel ${(travelLength(raw.strokes) / 1000).toFixed(2)} → ${(travelLength(d.strokes) / 1000).toFixed(2)} m, ${stats(sim).moves} moves`,
    );
    expect(travelLength(d.strokes)).toBeLessThanOrEqual(travelLength(raw.strokes) + 1e-6);
  });
});
