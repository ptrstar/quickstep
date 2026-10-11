import { type GraphDoc, type GroupNode, newId, type NodeId } from "./doc";

/** Where the editor is: [] = top level, [groupId, innerGroupId, …] = inside nested groups. */
export type GraphPath = NodeId[];

/** The graph shown at `path`. Falls back to the deepest group that still exists. */
export function graphAt(doc: GraphDoc, path: GraphPath): GraphDoc {
  let g = doc;
  for (const id of path) {
    const node = g.nodes.find((n) => n.id === id);
    if (!node || node.kind !== "group") return g;
    g = node.graph;
  }
  return g;
}

/** The longest prefix of `path` that still names groups. */
export function validPath(doc: GraphDoc, path: GraphPath): GraphPath {
  const out: GraphPath = [];
  let g = doc;
  for (const id of path) {
    const node = g.nodes.find((n) => n.id === id);
    if (!node || node.kind !== "group") break;
    out.push(id);
    g = node.graph;
  }
  return out;
}

/** Drops group ports (and pins) that point at inner nodes or ports that no longer exist. */
function pruneGroup(group: GroupNode): GroupNode {
  const ids = new Set(group.graph.nodes.map((n) => n.id));
  return {
    ...group,
    inputs: group.inputs.filter((p) => ids.has(p.inner.node)),
    outputs: group.outputs.filter((p) => ids.has(p.inner.node)),
    pinned: group.pinned.filter((p) => ids.has(p.node)),
  };
}

/** Replaces the graph at `path` with `change(graph)`, keeping every enclosing group consistent. */
export function updateAt(doc: GraphDoc, path: GraphPath, change: (g: GraphDoc) => GraphDoc): GraphDoc {
  if (path.length === 0) return change(doc);
  const [head, ...rest] = path;
  const group = doc.nodes.find((n) => n.id === head);
  if (!group || group.kind !== "group") return doc;
  const updated = pruneGroup({ ...group, graph: updateAt(group.graph, rest, change) });
  const names = (ps: { name: string }[]) => new Set(ps.map((p) => p.name));
  const ins = names(updated.inputs);
  const outs = names(updated.outputs);
  return {
    nodes: doc.nodes.map((n) => (n.id === head ? updated : n)),
    // wires to ports the group no longer has go away
    edges: doc.edges.filter((e) => (e.to.node !== head || ins.has(e.to.port)) && (e.from.node !== head || outs.has(e.from.port))),
  };
}

/** Copies of the given nodes (groups included, inner ids kept), offset, with the wires between them. */
export function duplicate(doc: GraphDoc, ids: NodeId[], offset = { x: 40, y: 40 }): { doc: GraphDoc; ids: NodeId[] } {
  const map = new Map<NodeId, NodeId>();
  const copies = doc.nodes
    .filter((n) => ids.includes(n.id))
    .map((n) => {
      const id = newId(n.kind === "group" ? "g" : "n");
      map.set(n.id, id);
      return { ...structuredClone(n), id, position: { x: n.position.x + offset.x, y: n.position.y + offset.y } };
    });
  const edges = doc.edges
    .filter((e) => map.has(e.from.node) && map.has(e.to.node))
    .map((e) => ({ from: { ...e.from, node: map.get(e.from.node)! }, to: { ...e.to, node: map.get(e.to.node)! } }));
  return { doc: { nodes: [...doc.nodes, ...copies], edges: [...doc.edges, ...edges] }, ids: copies.map((c) => c.id) };
}
