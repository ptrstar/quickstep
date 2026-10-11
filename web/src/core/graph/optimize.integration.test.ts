import { describe, expect, it } from "vitest";
import { compile } from "../quickstep/compile";
import { DEFAULT_PARAMS } from "../quickstep/params";
import { simulate, stats } from "../sim/simulate";
import { defaultPipeline } from "./defaults";
import { setParam, updateNode } from "./doc";
import { registry } from "./nodes";
import { GraphSession } from "./session";

/** 200 × 280 portrait stand-in: dark ellipse "head" and shoulders on light ground. */
function portrait() {
  const w = 200;
  const h = 280;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const head = ((x - 100) / 55) ** 2 + ((y - 110) / 75) ** 2 < 1;
      const body = ((x - 100) / 95) ** 2 + ((y - 290) / 90) ** 2 < 1;
      const v = head ? 70 : body ? 40 : 225;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

describe("Optimize on the default pipeline", () => {
  // Measured: the time goes into the visible wiggles, which are the picture. Flattening only the
  // invisible ones cuts moves (bytes, lookahead) a lot and must not make the plot slower.
  it("plots the same picture with far fewer moves and no slower", () => {
    const s = new GraphSession(registry);
    s.addAsset("p", portrait());
    let doc = defaultPipeline(registry);
    doc = setParam(registry, doc, doc.nodes[0].id, "asset", "p");
    const opt = doc.nodes.find((n) => n.kind === "node" && n.type === "optimize")!.id;

    const run = (d: typeof doc) => {
      const drawing = s.run(d).drawing!;
      const sim = simulate(compile(drawing.strokes, DEFAULT_PARAMS), DEFAULT_PARAMS);
      return { seconds: sim.duration, moves: stats(sim).moves };
    };
    const before = run(updateNode(doc, opt, (n) => ({ ...n, bypass: true })));
    const after = run(doc);
    console.info(`optimize: ${before.seconds.toFixed(0)} s / ${before.moves} moves → ${after.seconds.toFixed(0)} s / ${after.moves} moves`);
    expect(after.moves).toBeLessThan(before.moves * 0.7);
    expect(after.seconds).toBeLessThanOrEqual(before.seconds * 1.005);
  });
});
