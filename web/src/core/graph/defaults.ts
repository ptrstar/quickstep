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

/** The starting pipeline: AmplifyLine portrait waves on A6, optimized for plotting. */
export function defaultPipeline(registry: Registry): GraphDoc {
  return ensureOutput(registry, chain(registry, ["image", "grayscale", "contrast", "blur", "amplifyLine", "paper", "optimize"]));
}
