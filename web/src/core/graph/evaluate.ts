import { type GraphDoc, type NodeId, type PortRef, type Registry, topoOrder } from "./doc";
import { type FlatGraph, flatten, resolveOutput } from "./group";
import { type ComputeContext, NeedsInput, type Value } from "./types";

export type NodeState = "ok" | "error" | "waiting" | "bypassed";

export type NodeStatus = {
  state: NodeState;
  /** Compute time of the last real computation, ms. */
  ms: number;
  /** Computed in this run (false: reused from the cache). */
  fresh: boolean;
  error?: string;
  summary?: string;
};

export type EvalResult = {
  flat: FlatGraph;
  /** Outputs by flat node id. */
  outputs: Map<NodeId, Record<string, Value>>;
  /** Status by flat node id, and by group id (aggregated over its members). */
  status: Map<NodeId, NodeStatus>;
};

type CacheEntry = { key: string; version: number; outputs: Record<string, Value>; status: NodeStatus };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Evaluates a graph, recomputing only nodes whose type, params, bypass or inputs changed since the
 * previous run. A node computes once all its inputs have values; otherwise it is "waiting", and so
 * is everything downstream.
 */
export class Evaluator {
  private cache = new Map<NodeId, CacheEntry>();
  private versions = 0;

  constructor(private readonly registry: Registry) {}

  run(doc: GraphDoc, ctx: ComputeContext): EvalResult {
    const flat = flatten(doc);
    const byId = new Map(flat.nodes.map((n) => [n.id, n]));
    const order = topoOrder(flat);
    const outputs = new Map<NodeId, Record<string, Value>>();
    const status = new Map<NodeId, NodeStatus>();
    const versionOf = new Map<NodeId, number>();
    const next = new Map<NodeId, CacheEntry>();

    for (const id of order) {
      const node = byId.get(id)!;
      const def = this.registry.get(node.type);
      if (!def) {
        status.set(id, { state: "error", ms: 0, fresh: false, error: `unknown node type ${node.type}` });
        continue;
      }

      // gather inputs; any missing one means waiting
      const inputs: Record<string, Value> = {};
      const sources: string[] = [];
      let missing: string | undefined;
      for (const port of def.inputs) {
        const edge = flat.edges.find((e) => e.to.node === id && e.to.port === port.name);
        const value = edge && outputs.get(edge.from.node)?.[edge.from.port];
        if (!edge || value === undefined) {
          missing ??= edge ? `waiting for ${port.name}` : `connect ${port.name}`;
          continue;
        }
        inputs[port.name] = value;
        sources.push(`${versionOf.get(edge.from.node)}:${edge.from.port}`);
      }
      if (missing) {
        status.set(id, { state: "waiting", ms: 0, fresh: false, error: missing });
        continue;
      }

      const key = `${node.type}|${node.bypass ? 1 : 0}|${JSON.stringify(node.params)}|${sources.join(",")}`;
      const cached = this.cache.get(id);
      let entry: CacheEntry;
      if (cached && cached.key === key) {
        entry = { ...cached, status: { ...cached.status, fresh: false } };
      } else if (node.bypass) {
        // pass through the first input whose type matches each output
        const passed: Record<string, Value> = {};
        for (const out of def.outputs) {
          const inp = def.inputs.find((p) => p.type === out.type);
          if (inp) passed[out.name] = inputs[inp.name];
        }
        const ok = Object.keys(passed).length === def.outputs.length;
        entry = {
          key,
          version: ++this.versions,
          outputs: ok ? passed : {},
          status: ok
            ? { state: "bypassed", ms: 0, fresh: true }
            : { state: "error", ms: 0, fresh: true, error: "cannot be bypassed: no input of the output's type" },
        };
      } else {
        const t0 = now();
        try {
          const out = def.compute(inputs, node.params, ctx);
          const ms = now() - t0;
          entry = { key, version: ++this.versions, outputs: out, status: { state: "ok", ms, fresh: true, summary: def.summary?.(out, node.params) } };
        } catch (e) {
          entry = {
            key,
            version: ++this.versions,
            outputs: {},
            status: {
              state: e instanceof NeedsInput ? "waiting" : "error",
              ms: now() - t0,
              fresh: true,
              error: e instanceof Error ? e.message : String(e),
            },
          };
        }
      }
      next.set(id, entry);
      versionOf.set(id, entry.version);
      if (entry.status.state === "ok" || entry.status.state === "bypassed") outputs.set(id, entry.outputs);
      status.set(id, entry.status);
    }

    this.cache = next; // drop what the graph no longer has
    aggregateGroups(doc, status);
    return { flat, outputs, status };
  }
}

/** A group's status: errors and waiting win, time is the sum, summary from its first output. */
function aggregateGroups(doc: GraphDoc, status: Map<NodeId, NodeStatus>, path: NodeId[] = []) {
  for (const node of doc.nodes) {
    if (node.kind !== "group") continue;
    const prefix = [...path, node.id].join("/");
    aggregateGroups(node.graph, status, [...path, node.id]);
    const inner = [...status.entries()].filter(([id]) => id.startsWith(prefix + "/")).map(([, s]) => s);
    const worst = inner.find((s) => s.state === "error") ?? inner.find((s) => s.state === "waiting");
    const first = node.outputs[0] && resolveOutput(node.graph, node.outputs[0].inner, [...path, node.id]);
    status.set(prefix, {
      state: worst?.state ?? "ok",
      error: worst?.error,
      ms: inner.reduce((t, s) => t + s.ms, 0),
      fresh: inner.some((s) => s.fresh),
      summary: first ? status.get(first.node)?.summary : undefined,
    });
  }
}

/** The value at an output port of the edited graph (group ports resolved). */
export function valueAt(doc: GraphDoc, result: EvalResult, ref: PortRef): Value | undefined {
  const flat = resolveOutput(doc, ref);
  return flat && result.outputs.get(flat.node)?.[flat.port];
}
