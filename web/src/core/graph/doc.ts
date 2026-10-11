import type { DataType, NodeDef, ParamSpec, Params, Point } from "./types";

/**
 * The graph as the user edits it, and as presets store it. Plain JSON.
 * A group holds a whole inner graph and exposes some of its inner ports as its own.
 */
export type NodeId = string;
export type PortRef = { node: NodeId; port: string };
export type Edge = { from: PortRef; to: PortRef };

export type PlainNode = {
  id: NodeId;
  kind: "node";
  type: string;
  params: Params;
  position: Point;
  bypass?: boolean;
};

export type GroupPort = { name: string; type: DataType; inner: PortRef };

export type GroupNode = {
  id: NodeId;
  kind: "group";
  name: string;
  graph: GraphDoc;
  inputs: GroupPort[];
  outputs: GroupPort[];
  /** Inner controls shown on the group's own drawer. */
  pinned: { node: NodeId; param: string }[];
  position: Point;
};

export type GraphNode = PlainNode | GroupNode;

export type GraphDoc = { nodes: GraphNode[]; edges: Edge[] };

export type Registry = ReadonlyMap<string, NodeDef>;

export const emptyGraph = (): GraphDoc => ({ nodes: [], edges: [] });

let counter = 0;
/** Short unique id. */
export function newId(prefix = "n"): NodeId {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Fills missing params with defaults, clamps numbers, drops unknown keys and wrong types. */
export function normalizeParams(specs: Record<string, ParamSpec>, params: Params = {}): Params {
  const out: Params = {};
  for (const [key, spec] of Object.entries(specs)) {
    const v = params[key];
    switch (spec.kind) {
      case "number":
        out[key] = typeof v === "number" && Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, v)) : spec.default;
        break;
      case "select":
        out[key] = typeof v === "string" && spec.options.some((o) => o.value === v) ? v : spec.default;
        break;
      case "boolean":
        out[key] = typeof v === "boolean" ? v : spec.default;
        break;
      default:
        out[key] = typeof v === "string" ? v : spec.default;
    }
  }
  return out;
}

export function createNode(registry: Registry, type: string, position: Point = { x: 0, y: 0 }, params: Params = {}): PlainNode {
  const def = registry.get(type);
  if (!def) throw new Error(`unknown node type "${type}"`);
  return { id: newId(), kind: "node", type, params: normalizeParams(def.params, params), position };
}

/** Input and output ports of a node, plain or group. */
export function portsOf(registry: Registry, node: GraphNode): { inputs: { name: string; type: DataType }[]; outputs: { name: string; type: DataType }[] } {
  if (node.kind === "group") return { inputs: node.inputs, outputs: node.outputs };
  const def = registry.get(node.type);
  if (!def) return { inputs: [], outputs: [] };
  return { inputs: def.inputs, outputs: def.outputs };
}

export function findNode(doc: GraphDoc, id: NodeId): GraphNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

function portType(registry: Registry, doc: GraphDoc, ref: PortRef, side: "inputs" | "outputs"): DataType | undefined {
  const node = findNode(doc, ref.node);
  return node && portsOf(registry, node)[side].find((p) => p.name === ref.port)?.type;
}

/** Would `from → to` create a cycle? */
function reaches(doc: GraphDoc, from: NodeId, to: NodeId): boolean {
  const seen = new Set<NodeId>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of doc.edges) if (e.from.node === id) stack.push(e.to.node);
  }
  return false;
}

export type ConnectResult = { ok: true; doc: GraphDoc } | { ok: false; reason: string };

/**
 * Connects an output to an input. An input takes one wire, so an existing wire into it is replaced.
 * Refuses unknown ports, mismatched types and cycles.
 */
export function connect(registry: Registry, doc: GraphDoc, from: PortRef, to: PortRef): ConnectResult {
  const out = portType(registry, doc, from, "outputs");
  const inp = portType(registry, doc, to, "inputs");
  if (!out || !inp) return { ok: false, reason: "no such port" };
  if (out !== inp) return { ok: false, reason: `${out} cannot connect to ${inp}` };
  if (from.node === to.node || reaches(doc, to.node, from.node)) return { ok: false, reason: "would make a loop" };
  const edges = doc.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port));
  return { ok: true, doc: { ...doc, edges: [...edges, { from, to }] } };
}

export function disconnect(doc: GraphDoc, to: PortRef): GraphDoc {
  return { ...doc, edges: doc.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port)) };
}

export function addNode(doc: GraphDoc, node: GraphNode): GraphDoc {
  return { ...doc, nodes: [...doc.nodes, node] };
}

export function removeNodes(doc: GraphDoc, ids: NodeId[]): GraphDoc {
  const gone = new Set(ids);
  return {
    nodes: doc.nodes.filter((n) => !gone.has(n.id)),
    edges: doc.edges.filter((e) => !gone.has(e.from.node) && !gone.has(e.to.node)),
  };
}

export function updateNode(doc: GraphDoc, id: NodeId, change: (n: GraphNode) => GraphNode): GraphDoc {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? change(n) : n)) };
}

export function setParam(registry: Registry, doc: GraphDoc, id: NodeId, key: string, value: Params[string]): GraphDoc {
  return updateNode(doc, id, (n) => {
    if (n.kind !== "node") return n;
    const def = registry.get(n.type);
    return def ? { ...n, params: normalizeParams(def.params, { ...n.params, [key]: value }) } : n;
  });
}

/** Node ids in an order where every node comes after the nodes feeding it. */
export function topoOrder(doc: GraphDoc): NodeId[] {
  const incoming = new Map<NodeId, number>(doc.nodes.map((n) => [n.id, 0]));
  for (const e of doc.edges) if (incoming.has(e.to.node)) incoming.set(e.to.node, incoming.get(e.to.node)! + 1);
  const ready = doc.nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  const order: NodeId[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const e of doc.edges) {
      if (e.from.node !== id || !incoming.has(e.to.node)) continue;
      const left = incoming.get(e.to.node)! - 1;
      incoming.set(e.to.node, left);
      if (left === 0) ready.push(e.to.node);
    }
  }
  return order;
}
