/// <reference lib="webworker" />
// Evaluates the node graph off the main thread. All logic is in GraphSession (tested); this only
// passes messages, and parses font files.
import opentype from "opentype.js";
import type { GraphDoc } from "@/core/graph/doc";
import { registry } from "@/core/graph/nodes";
import { GraphSession, type SessionResult } from "@/core/graph/session";
import type { RgbaImage } from "@/core/graph/types";
import { fromOpenType, type OpenTypeLike, parseSvgFont } from "@/core/text/font";

export type ToWorker =
  | { type: "asset"; key: string; image: RgbaImage }
  | { type: "font"; key: string; format: "svg"; data: string }
  | { type: "font"; key: string; format: "binary"; data: ArrayBuffer }
  | { type: "run"; id: number; doc: GraphDoc };

export type FromWorker =
  | { type: "result"; id: number; result: SessionResult }
  | { type: "failed"; id: number; error: string }
  | { type: "font"; key: string; ok: true; name: string; kind: "single-line" | "outline" }
  | { type: "font"; key: string; ok: false; error: string };

const session = new GraphSession(registry);
const scope = self as unknown as DedicatedWorkerGlobalScope;
const reply = (msg: FromWorker, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "asset") {
    session.addAsset(msg.key, msg.image);
  } else if (msg.type === "font") {
    try {
      const font = msg.format === "svg" ? parseSvgFont(msg.data) : fromOpenType(opentype.parse(msg.data) as unknown as OpenTypeLike);
      session.addFont(msg.key, font);
      reply({ type: "font", key: msg.key, ok: true, name: font.name, kind: font.kind });
    } catch (err) {
      reply({ type: "font", key: msg.key, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    try {
      const result = session.run(msg.doc);
      const transfer = result.thumbs.flatMap(([, t]) => (t.kind === "raster" ? [t.data.buffer as ArrayBuffer] : []));
      reply({ type: "result", id: msg.id, result }, transfer);
    } catch (err) {
      reply({ type: "failed", id: msg.id, error: String(err) });
    }
  }
};
