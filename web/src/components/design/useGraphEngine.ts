"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphDoc, NodeStatus, PaperDrawing, RgbaImage, Thumb } from "@/core/graph";
import { newId } from "@/core/graph";
import { BUILTIN_FONTS } from "@/core/text/builtin";
import type { FromWorker, ToWorker } from "@/workers/graph.worker";

export type FontInfo = { key: string; name: string; kind: "single-line" | "outline"; builtin: boolean };

export type EngineState = {
  status: Map<string, NodeStatus>;
  thumbs: Map<string, Thumb>;
  drawing?: PaperDrawing;
  busy: boolean;
  error?: string;
};

/**
 * Runs the graph in a Web Worker whenever it changes. Only the newest graph is evaluated: edits
 * that arrive while a run is busy replace each other, and the latest one runs next. Also loads the
 * built-in fonts, and fonts the user picks, into the worker.
 */
export function useGraphEngine(doc: GraphDoc, onMessage: (text: string) => void = () => {}) {
  const worker = useRef<Worker | null>(null);
  const pending = useRef<GraphDoc | null>(null);
  const latest = useRef<GraphDoc>(doc);
  const running = useRef(false);
  const runId = useRef(0);
  const message = useRef(onMessage);
  const [state, setState] = useState<EngineState>({ status: new Map(), thumbs: new Map(), busy: false });
  const [fonts, setFonts] = useState<FontInfo[]>(BUILTIN_FONTS.map((f) => ({ key: f.key, name: f.label, kind: "single-line", builtin: true })));

  useEffect(() => {
    message.current = onMessage;
    latest.current = doc;
  });

  const post = useCallback((msg: ToWorker, transfer: Transferable[] = []) => worker.current?.postMessage(msg, transfer), []);

  const runNext = useCallback(() => {
    const next = pending.current;
    if (!next || running.current || !worker.current) return;
    pending.current = null;
    running.current = true;
    setState((s) => ({ ...s, busy: true }));
    post({ type: "run", id: ++runId.current, doc: next });
  }, [post]);

  /** Evaluate again (e.g. a font arrived that a node was waiting for). */
  const rerun = useCallback(() => {
    pending.current = latest.current;
    runNext();
  }, [runNext]);

  useEffect(() => {
    const w = new Worker(new URL("../../workers/graph.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === "font") {
        if (msg.ok) {
          setFonts((list) => [...list.filter((f) => f.key !== msg.key), { key: msg.key, name: msg.name, kind: msg.kind, builtin: BUILTIN_FONTS.some((b) => b.key === msg.key) }]);
          rerun();
        } else {
          message.current(`Could not read the font: ${msg.error}`);
        }
        return;
      }
      running.current = false;
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
    for (const f of BUILTIN_FONTS) {
      fetch(`/fonts/${f.file}`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
        .then((data) => w.postMessage({ type: "font", key: f.key, format: "svg", data } satisfies ToWorker))
        .catch(() => message.current(`Could not load the font ${f.label}`));
    }
    runNext();
    return () => {
      w.terminate();
      worker.current = null;
      running.current = false;
    };
  }, [runNext, rerun]);

  useEffect(() => {
    pending.current = doc;
    runNext();
  }, [doc, runNext]);

  /** Hands a loaded image to the worker. The graph refers to it by `key`. */
  const addAsset = useCallback((key: string, image: RgbaImage) => post({ type: "asset", key, image }), [post]);

  /** Loads a font file (SVG font, TTF, OTF, WOFF); returns the key nodes refer to it by. */
  const addFont = useCallback(
    async (file: File): Promise<string> => {
      const key = `font:${file.name}#${newId("f")}`;
      if (/\.svg$/i.test(file.name)) post({ type: "font", key, format: "svg", data: await file.text() });
      else {
        const data = await file.arrayBuffer();
        post({ type: "font", key, format: "binary", data }, [data]);
      }
      return key;
    },
    [post],
  );

  /** Registers (or replaces) an SVG font under a fixed key, e.g. your handwriting font. */
  const addFontSvg = useCallback((key: string, svg: string) => post({ type: "font", key, format: "svg", data: svg }), [post]);

  return { ...state, fonts, addAsset, addFont, addFontSvg };
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
