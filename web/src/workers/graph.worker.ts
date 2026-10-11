/// <reference lib="webworker" />
// Evaluates the node graph off the main thread. All logic is in GraphSession (tested); this only
// passes messages.
import { registry } from "@/core/graph/nodes";
import { GraphSession, type SessionResult } from "@/core/graph/session";
import type { GraphDoc } from "@/core/graph/doc";
import type { RgbaImage } from "@/core/graph/types";

export type ToWorker = { type: "asset"; key: string; image: RgbaImage } | { type: "run"; id: number; doc: GraphDoc };
export type FromWorker = { type: "result"; id: number; result: SessionResult } | { type: "failed"; id: number; error: string };

const session = new GraphSession(registry);
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "asset") {
    session.addAsset(msg.key, msg.image);
    return;
  }
  try {
    const result = session.run(msg.doc);
    const transfer = result.thumbs.flatMap(([, t]) => (t.kind === "raster" ? [t.data.buffer as ArrayBuffer] : []));
    scope.postMessage({ type: "result", id: msg.id, result } satisfies FromWorker, transfer);
  } catch (err) {
    scope.postMessage({ type: "failed", id: msg.id, error: String(err) } satisfies FromWorker);
  }
};
