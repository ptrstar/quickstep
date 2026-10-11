"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphDoc, NodeStatus, PaperDrawing, RgbaImage, Thumb } from "@/core/graph";
import type { FromWorker, ToWorker } from "@/workers/graph.worker";

export type EngineState = {
  status: Map<string, NodeStatus>;
  thumbs: Map<string, Thumb>;
  drawing?: PaperDrawing;
  busy: boolean;
  error?: string;
};

/**
 * Runs the graph in a Web Worker whenever it changes. Only the newest graph is evaluated: edits
 * that arrive while a run is busy replace each other, and the latest one runs next.
 */
export function useGraphEngine(doc: GraphDoc) {
  const worker = useRef<Worker | null>(null);
  const pending = useRef<GraphDoc | null>(null);
  const running = useRef(false);
  const runId = useRef(0);
  const [state, setState] = useState<EngineState>({ status: new Map(), thumbs: new Map(), busy: false });

  const post = useCallback((msg: ToWorker, transfer: Transferable[] = []) => worker.current?.postMessage(msg, transfer), []);

  const runNext = useCallback(() => {
    const next = pending.current;
    if (!next || running.current || !worker.current) return;
    pending.current = null;
    running.current = true;
    setState((s) => ({ ...s, busy: true }));
    post({ type: "run", id: ++runId.current, doc: next });
  }, [post]);

  useEffect(() => {
    const w = new Worker(new URL("../../workers/graph.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      running.current = false;
      const msg = e.data;
      if (msg.type === "failed") {
        setState((s) => ({ ...s, busy: false, error: msg.error }));
      } else {
        const r = msg.result;
        setState((s) => {
          const thumbs = new Map(s.thumbs);
          for (const id of r.cleared) thumbs.delete(id);
          for (const [id, t] of r.thumbs) thumbs.set(id, t);
          return { status: new Map(r.status), thumbs, drawing: r.drawing, busy: false };
        });
      }
      runNext();
    };
    runNext();
    return () => {
      w.terminate();
      worker.current = null;
      running.current = false;
    };
  }, [runNext]);

  useEffect(() => {
    pending.current = doc;
    runNext();
  }, [doc, runNext]);

  /** Hands a loaded image to the worker. The graph refers to it by `key`. */
  const addAsset = useCallback((key: string, image: RgbaImage) => post({ type: "asset", key, image }), [post]);

  return { ...state, addAsset };
}

/** Decodes an image file into pixels, at most `maxSide` px on the longer side. */
export async function decodeImage(file: File, maxSide = 3000): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}
