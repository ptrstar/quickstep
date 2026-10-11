import { connect, createNode, type GraphDoc, type Registry } from "./doc";
import { ensureOutput } from "./output";

/** Horizontal distance between nodes in the default layouts. */
export const NODE_PITCH = 260;

/**
 * Builds a straight chain of nodes, wiring each node's first output to the next node's first input.
 * Laid out in rows of three, so the graph stays compact.
 */
export function chain(registry: Registry, types: string[], params: Record<string, Record<string, string | number>> = {}): GraphDoc {
  const nodes = types.map((t, i) => createNode(registry, t, { x: (i % 3) * NODE_PITCH, y: Math.floor(i / 3) * 240 }, params[t]));
  let doc: GraphDoc = { nodes, edges: [] };
  for (let i = 0; i + 1 < nodes.length; i++) {
    const out = registry.get(nodes[i].type)!.outputs[0];
    const inp = registry.get(nodes[i + 1].type)!.inputs[0];
    const r = connect(registry, doc, { node: nodes[i].id, port: out.name }, { node: nodes[i + 1].id, port: inp.name });
    if (!r.ok) throw new Error(`cannot chain ${nodes[i].type} → ${nodes[i + 1].type}: ${r.reason}`);
    doc = r.doc;
  }
  return doc;
}

/** Edge detection traced into lines. */
export function edgeSketch(registry: Registry): GraphDoc {
  return ensureOutput(registry, chain(registry, ["image", "grayscale", "edges", "paper", "optimize"]));
}

/** Tonal cross-hatching. */
export function crosshatch(registry: Registry): GraphDoc {
  return ensureOutput(registry, chain(registry, ["image", "grayscale", "contrast", "blur", "hatching", "paper", "optimize"], { blur: { radius: 1 } }));
}

/**
 * Pen-and-ink: one grayscale feeds both the outlines (Edges) and the tone (Contrast → Blur), which
 * Ink drawing combines into hatching that stops short of the outlines.
 */
export function inkDrawing(registry: Registry): GraphDoc {
  let doc = chain(registry, ["image", "grayscale", "contrast", "blur", "ink", "paper", "optimize"], { blur: { radius: 1 } });
  const [, gray, , , inkNode] = doc.nodes;
  const edges = createNode(registry, "edges", { x: NODE_PITCH * 2, y: 480 });
  doc = { ...doc, nodes: [...doc.nodes, edges] };
  for (const [from, to] of [
    [{ node: gray.id, port: "gray" }, { node: edges.id, port: "gray" }],
    [{ node: edges.id, port: "lines" }, { node: inkNode.id, port: "outlines" }],
  ]) {
    const r = connect(registry, doc, from, to);
    if (!r.ok) throw new Error(r.reason);
    doc = r.doc;
  }
  return ensureOutput(registry, doc);
}

/** Weighted Voronoi stippling. */
export function stippling(registry: Registry): GraphDoc {
  return ensureOutput(registry, chain(registry, ["image", "grayscale", "contrast", "stipple", "paper", "optimize"]));
}

/** Generative designs: a source straight onto the paper. */
export function generative(registry: Registry, source: string, params: Record<string, string | number> = {}): GraphDoc {
  return ensureOutput(registry, chain(registry, [source, "paper", "optimize"], { [source]: params }));
}

/** A spirograph turned into a shrinking, rotating tunnel. */
export function rosette(registry: Registry): GraphDoc {
  return ensureOutput(
    registry,
    chain(registry, ["spirograph", "repeat", "paper", "optimize"], {
      spirograph: { ring: 60, wheel: 25, pen: 1.1 },
      repeat: { copies: 10, rotate: 6, scale: 0.92 },
    }),
  );
}

/** The starting pipeline: AmplifyLine portrait waves on A6, optimized for plotting. */
export function defaultPipeline(registry: Registry): GraphDoc {
  return ensureOutput(registry, chain(registry, ["image", "grayscale", "contrast", "blur", "amplifyLine", "paper", "optimize"]));
}
