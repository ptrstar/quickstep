"use client";

import { useEffect, useRef, useState } from "react";
import { inkLength, type PaperDrawing, type Thumb } from "@/core/graph";
import styles from "./PaperView.module.css";
import { drawThumb, strokePaths } from "./thumbCanvas";

const PEN_MM = 0.35;

/** The sheet with the final drawing at its real proportions, or the selected node's output. */
export function PaperView({ drawing, selected, selectedLabel }: { drawing?: PaperDrawing; selected?: Thumb; selectedLabel?: string }) {
  const [mode, setMode] = useState<"output" | "selected">("output");
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const showSelected = mode === "selected" && selected;

  useEffect(() => {
    const c = canvas.current;
    if (!c || size.width === 0) return;
    if (showSelected) {
      drawThumb(c, selected, size.width, size.height, 1);
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.width * dpr);
    c.height = Math.round(size.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    if (!drawing) return;
    const pad = 16;
    const { width: pw, height: ph } = drawing.paper;
    const s = Math.min((size.width - 2 * pad) / pw, (size.height - 2 * pad) / ph);
    const ox = (size.width - pw * s) / 2;
    const oy = (size.height - ph * s) / 2;
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fbfbf8";
    ctx.fillRect(ox, oy, pw * s, ph * s);
    ctx.shadowColor = "transparent";
    strokePaths(ctx, drawing.strokes, s, ox, oy, Math.max(0.6, PEN_MM * s));
  }, [drawing, selected, showSelected, size]);

  return (
    <section className={styles.panel}>
      <div className={styles.bar}>
        <strong>Paper</strong>
        {drawing && (
          <span className={styles.muted}>
            {drawing.paper.width} × {drawing.paper.height} mm
          </span>
        )}
        <div className={styles.toggle} role="group" aria-label="Paper view">
          <button type="button" aria-pressed={mode === "output"} onClick={() => setMode("output")}>
            Output
          </button>
          <button type="button" aria-pressed={mode === "selected"} onClick={() => setMode("selected")} disabled={!selected}>
            Selected node
          </button>
        </div>
      </div>
      <div ref={box} className={styles.stage}>
        <canvas ref={canvas} style={{ width: size.width, height: size.height }} aria-label={showSelected ? `Output of ${selectedLabel}` : "Drawing on paper"} />
        {!drawing && !showSelected && <p className={styles.empty}>Load an image in the Image node to see the drawing</p>}
      </div>
      <div className={styles.stats}>
        {showSelected ? (
          <span>{selectedLabel}</span>
        ) : drawing ? (
          <>
            <span>
              <b>{(inkLength(drawing.strokes) / 1000).toFixed(2)} m</b> ink
            </span>
            <span>
              <b>{drawing.strokes.length}</b> strokes
            </span>
            <span>time and speed in ② Plot</span>
          </>
        ) : null}
      </div>
    </section>
  );
}
