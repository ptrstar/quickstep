import {
  type Edge,
  findNode,
  type GraphDoc,
  type GroupNode,
  type GroupPort,
  newId,
  type NodeId,
  type PlainNode,
  type PortRef,
  portsOf,
  type Registry,
} from "./doc";

const same = (a: PortRef, b: PortRef) => a.node === b.node && a.port === b.port;

/**
 * Turns the selected nodes into one group. Its ports are the inner ports that the selection does
 * not wire up itself: every input not fed from inside, and every output that feeds something
 * outside or nothing at all. Wires crossing the selection's border are rerouted through them.
 */
export function groupNodes(registry: Registry, doc: GraphDoc, ids: NodeId[], name = "Group"): { doc: GraphDoc; id: NodeId } {
  const inside = new Set(ids.filter((id) => findNode(doc, id)));
  if (inside.size === 0) throw new Error("nothing to group");
  const members = doc.nodes.filter((n) => inside.has(n.id));
  const innerEdges = doc.edges.filter((e) => inside.has(e.from.node) && inside.has(e.to.node));
  const id = newId("g");

  const used = new Set<string>();
  const unique = (base: string) => {
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base} ${i}`;
    used.add(n);
    return n;
  };

  const inputs: GroupPort[] = [];
  const outputs: GroupPort[] = [];
  const edges: Edge[] = doc.edges.filter((e) => !inside.has(e.from.node) && !inside.has(e.to.node));

  for (const node of members) {
    const ports = portsOf(registry, node);
    for (const p of ports.inputs) {
      const ref = { node: node.id, port: p.name };
      if (innerEdges.some((e) => same(e.to, ref))) continue;
      const name = unique(p.name);
      inputs.push({ name, type: p.type, inner: ref });
      const feed = doc.edges.find((e) => same(e.to, ref));
      if (feed) edges.push({ from: feed.from, to: { node: id, port: name } });
    }
    for (const p of ports.outputs) {
      const ref = { node: node.id, port: p.name };
      const outside = doc.edges.filter((e) => same(e.from, ref) && !inside.has(e.to.node));
      const insideUse = innerEdges.some((e) => same(e.from, ref));
      if (outside.length === 0 && insideUse) continue;
      const name = unique(p.name);
      outputs.push({ name, type: p.type, inner: ref });
      for (const e of outside) edges.push({ from: { node: id, port: name }, to: e.to });
    }
  }

  const position = {
    x: members.reduce((s, n) => s + n.position.x, 0) / members.length,
    y: members.reduce((s, n) => s + n.position.y, 0) / members.length,
  };
  const group: GroupNode = { id, kind: "group", name, graph: { nodes: members, edges: innerEdges }, inputs, outputs, pinned: [], position };
  return { doc: { nodes: [...doc.nodes.filter((n) => !inside.has(n.id)), group], edges }, id };
}

/** Puts a group's nodes back into the surrounding graph, rewiring its ports to the inner ports. */
export function ungroup(doc: GraphDoc, id: NodeId): GraphDoc {
  const group = findNode(doc, id);
  if (!group || group.kind !== "group") return doc;
  const edges: Edge[] = [...group.graph.edges];
  for (const e of doc.edges) {
    if (e.to.node === id) {
      const port = group.inputs.find((p) => p.name === e.to.port);
      if (port) edges.push({ from: e.from, to: port.inner });
    } else if (e.from.node === id) {
      const port = group.outputs.find((p) => p.name === e.from.port);
      if (port) edges.push({ from: port.inner, to: e.to });
    } else {
      edges.push(e);
    }
  }
  return { nodes: [...doc.nodes.filter((n) => n.id !== id), ...group.graph.nodes], edges };
}

/** A plain node of the flattened graph, with the path of group ids that contain it. */
export type FlatNode = PlainNode & { path: NodeId[] };
export type FlatGraph = { nodes: FlatNode[]; edges: Edge[] };

/** Id of an inner node in the flattened graph. */
export const flatId = (path: NodeId[], id: NodeId) => [...path, id].join("/");

/** The flat output port that a (possibly group) output port really is. */
export function resolveOutput(doc: GraphDoc, ref: PortRef, path: NodeId[] = []): PortRef | undefined {
  const node = findNode(doc, ref.node);
  if (!node) return undefined;
  if (node.kind === "node") return { node: flatId(path, node.id), port: ref.port };
  const port = node.outputs.find((p) => p.name === ref.port);
  return port && resolveOutput(node.graph, port.inner, [...path, node.id]);
}

/** The flat input port that a (possibly group) input port really is. */
export function resolveInput(doc: GraphDoc, ref: PortRef, path: NodeId[] = []): PortRef | undefined {
  const node = findNode(doc, ref.node);
  if (!node) return undefined;
  if (node.kind === "node") return { node: flatId(path, node.id), port: ref.port };
  const port = node.inputs.find((p) => p.name === ref.port);
  return port && resolveInput(node.graph, port.inner, [...path, node.id]);
}

/** Dissolves all groups (recursively) into one graph of plain nodes with prefixed ids. */
export function flatten(doc: GraphDoc, path: NodeId[] = []): FlatGraph {
  const nodes: FlatNode[] = [];
  const edges: Edge[] = [];
  for (const node of doc.nodes) {
    if (node.kind === "node") {
      nodes.push({ ...node, id: flatId(path, node.id), path });
    } else {
      const inner = flatten(node.graph, [...path, node.id]);
      nodes.push(...inner.nodes);
      edges.push(...inner.edges);
    }
  }
  for (const e of doc.edges) {
    const from = resolveOutput(doc, e.from, path);
    const to = resolveInput(doc, e.to, path);
    if (from && to) edges.push({ from, to });
  }
  return { nodes, edges };
}
