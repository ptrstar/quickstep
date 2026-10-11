import { isBuiltinFont } from "../text/builtin";
import { type Edge, type GraphDoc, type GraphNode, normalizeParams, portsOf, type Registry } from "./doc";

/**
 * Presets store a whole pipeline (graph + every node value) by name. Blocks store one group for
 * reuse. Loaded images are not part of either: image references are cleared on save.
 */
export const PRESET_FORMAT = "quickstep-preset";
export const BLOCK_FORMAT = "quickstep-block";

export type Preset = { format: typeof PRESET_FORMAT; version: 1; name: string; graph: GraphDoc };
export type Block = { format: typeof BLOCK_FORMAT; version: 1; name: string; group: Extract<GraphNode, { kind: "group" }> };

export function toPreset(registry: Registry, name: string, doc: GraphDoc): Preset {
  return { format: PRESET_FORMAT, version: 1, name, graph: stripAssets(registry, doc) };
}

export function toBlock(registry: Registry, group: Extract<GraphNode, { kind: "group" }>): Block {
  return { format: BLOCK_FORMAT, version: 1, name: group.name, group: { ...group, graph: stripAssets(registry, group.graph) } };
}

function stripAssets(registry: Registry, doc: GraphDoc): GraphDoc {
  return {
    edges: doc.edges,
    nodes: doc.nodes.map((n) => {
      if (n.kind === "group") return { ...n, graph: stripAssets(registry, n.graph) };
      const def = registry.get(n.type);
      if (!def) return n;
      const params = { ...n.params };
      for (const [key, spec] of Object.entries(def.params)) {
        if (spec.kind === "asset") params[key] = "";
        if (spec.kind === "font" && !isBuiltinFont(String(params[key]))) params[key] = spec.default;
      }
      return { ...n, params };
    }),
  };
}

export class PresetError extends Error {}

/**
 * Reads a preset from untrusted JSON: unknown node types are an error; params are normalized
 * (missing → default, out of range → clamped); wires to missing or mismatched ports are dropped
 * and reported.
 */
export function parsePreset(registry: Registry, json: unknown): { preset: Preset; warnings: string[] } {
  const p = json as Partial<Preset>;
  if (!p || p.format !== PRESET_FORMAT || p.version !== 1) throw new PresetError("not a QuickStep preset");
  const warnings: string[] = [];
  const graph = checkGraph(registry, p.graph, warnings, "");
  return { preset: { format: PRESET_FORMAT, version: 1, name: String(p.name ?? "Untitled"), graph }, warnings };
}

export function parseBlock(registry: Registry, json: unknown): { block: Block; warnings: string[] } {
  const b = json as Partial<Block>;
  if (!b || b.format !== BLOCK_FORMAT || b.version !== 1) throw new PresetError("not a QuickStep block");
  const warnings: string[] = [];
  const [group] = checkGraph(registry, { nodes: [b.group as GraphNode], edges: [] }, warnings, "").nodes;
  if (group?.kind !== "group") throw new PresetError("a block must hold one group");
  return { block: { format: BLOCK_FORMAT, version: 1, name: String(b.name ?? group.name), group }, warnings };
}

function checkGraph(registry: Registry, raw: unknown, warnings: string[], where: string): GraphDoc {
  const g = raw as Partial<GraphDoc>;
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new PresetError(`malformed graph${where}`);
  const nodes: GraphNode[] = g.nodes.map((raw) => {
    const n = raw as GraphNode;
    if (!n || typeof n.id !== "string") throw new PresetError(`node without id${where}`);
    const position = { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 };
    if (n.kind === "group") {
      const graph = checkGraph(registry, n.graph, warnings, `${where} in ${n.name}`);
      const inner = new Set(graph.nodes.map((m) => m.id));
      const ports = (list: unknown) => (Array.isArray(list) ? list : []).filter((p) => inner.has(p?.inner?.node));
      return {
        id: n.id,
        kind: "group",
        name: String(n.name ?? "Group"),
        graph,
        inputs: ports(n.inputs),
        outputs: ports(n.outputs),
        pinned: (Array.isArray(n.pinned) ? n.pinned : []).filter((p) => inner.has(p?.node)),
        position,
      };
    }
    const def = registry.get(n.type);
    if (!def) throw new PresetError(`unknown node type "${n.type}"${where}`);
    return { id: n.id, kind: "node", type: n.type, params: normalizeParams(def.params, n.params), position, bypass: !!n.bypass };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = [];
  for (const raw of g.edges as Edge[]) {
    const from = raw?.from && byId.get(raw.from.node);
    const to = raw?.to && byId.get(raw.to.node);
    const out = from && portsOf(registry, from).outputs.find((p) => p.name === raw.from.port);
    const inp = to && portsOf(registry, to).inputs.find((p) => p.name === raw.to.port);
    if (!out || !inp || out.type !== inp.type) {
      warnings.push(`dropped a wire that no longer fits${where}`);
      continue;
    }
    edges.push({ from: raw.from, to: raw.to });
  }
  return { nodes, edges };
}
