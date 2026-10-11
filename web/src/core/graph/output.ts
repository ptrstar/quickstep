import { connect, createNode, type GraphDoc, type GraphNode, portsOf, type Registry } from "./doc";
import { OUTPUT_TYPE } from "./nodes";

export const isOutput = (n: GraphNode) => n.kind === "node" && n.type === OUTPUT_TYPE;

/**
 * Makes sure the top level has exactly one output node. A graph from before the output knob gets
 * one wired to the drawing it used to plot: the first drawing nothing else consumes.
 */
export function ensureOutput(registry: Registry, doc: GraphDoc): GraphDoc {
  const outputs = doc.nodes.filter(isOutput);
  if (outputs.length === 1) return doc;
  if (outputs.length > 1) {
    const extra = new Set(outputs.slice(1).map((n) => n.id));
    return { nodes: doc.nodes.filter((n) => !extra.has(n.id)), edges: doc.edges.filter((e) => !extra.has(e.to.node)) };
  }
  const right = doc.nodes.reduce((x, n) => Math.max(x, n.position.x), 0) + 300;
  const out = createNode(registry, OUTPUT_TYPE, { x: right, y: 0 });
  let next: GraphDoc = { ...doc, nodes: [...doc.nodes, out] };
  for (const n of doc.nodes) {
    const port = portsOf(registry, n).outputs.find((p) => p.type === "drawing");
    if (!port || doc.edges.some((e) => e.from.node === n.id && e.from.port === port.name)) continue;
    const r = connect(registry, next, { node: n.id, port: port.name }, { node: out.id, port: "drawing" });
    if (r.ok) next = r.doc;
    break;
  }
  return next;
}
