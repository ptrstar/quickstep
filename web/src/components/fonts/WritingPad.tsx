"use client";

import { useEffect, useRef, useState } from "react";
import type { Point, Stroke } from "@/core/geometry";
import { cleanStroke, METRICS } from "@/core/text/handwriting";
import styles from "./FontStudio.module.css";

// font units shown on the pad: a bit above the ascender to a bit below the descender
const TOP = METRICS.ascent + 120;
const BOTTOM = METRICS.descent - 100;
const WIDTH_UNITS = 1100;

/**
 * Write one character. Guide lines show ascender, cap height, x-height, baseline and descender; a
 * faint printed letter behind shows the size. Each pen stroke is cleaned and stored in font units.
 */
export function WritingPad({
  char,
  strokes,
  onStroke,
  scale = 1,
}: {
  char: string;
  strokes: Stroke[];
  onStroke: (s: Stroke) => void;
  /** 1 fills the pad; smaller writes at a more natural size. The font is the same either way. */
  scale?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const current = useRef<Point[] | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  // font units ↔ canvas pixels
  const k = (Math.min(size.height / (TOP - BOTTOM), size.width / WIDTH_UNITS) || 1) * scale;
  const ox = (size.width - WIDTH_UNITS * k) / 2;
  const oy = (size.height - (TOP - BOTTOM) * k) / 2;
  const toPx = (p: Point) => ({ x: ox + p.x * k, y: oy + (TOP - p.y) * k });
  const toUnits = (x: number, y: number): Point => ({ x: (x - ox) / k, y: TOP - (y - oy) / k });

  useEffect(() => {
    const c = canvas.current;
    if (!c || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.width * dpr;
    c.height = size.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#2a2e35";
    ctx.fillRect(0, 0, size.width, size.height);
    // the writing area itself (smaller than the pad when scaled down)
    ctx.fillStyle = "#fbfbf8";
    ctx.fillRect(ox, oy, WIDTH_UNITS * k, (TOP - BOTTOM) * k);

    // guides
    const guide = (y: number, label: string, dash: number[], alpha: number) => {
      const py = toPx({ x: 0, y }).y;
      ctx.setLineDash(dash);
      ctx.strokeStyle = `rgba(59, 110, 200, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, py);
      ctx.lineTo(ox + WIDTH_UNITS * k, py);
      ctx.stroke();
      ctx.setLineDash([]);
      if (scale >= 0.45) {
        ctx.fillStyle = `rgba(59, 110, 200, ${alpha + 0.2})`;
        ctx.font = "11px var(--font-mono), monospace";
        ctx.fillText(label, ox + 6, py - 4);
      }
    };
    guide(METRICS.ascent, "ascender", [6, 6], 0.35);
    guide(METRICS.capHeight, "capitals", [3, 5], 0.35);
    guide(METRICS.xHeight, "x-height", [3, 5], 0.45);
    guide(0, "baseline", [], 0.7);
    guide(METRICS.descent, "descender", [6, 6], 0.35);

    // faint reference letter, cap height matched
    const capPx = METRICS.capHeight * k;
    ctx.fillStyle = "rgba(27, 29, 34, 0.08)";
    ctx.font = `${capPx / 0.7}px Georgia, serif`;
    ctx.fillText(char, toPx({ x: 250, y: 0 }).x, toPx({ x: 0, y: 0 }).y);

    // strokes
    ctx.strokeStyle = "#1b1d22";
    ctx.fillStyle = "#1b1d22";
    ctx.lineWidth = Math.max(1.5, 18 * k);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of [...strokes, ...(current.current ? [current.current] : [])]) {
      ctx.beginPath();
      s.forEach((p, i) => {
        const q = toPx(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      if (s.length === 1) {
        const q = toPx(s[0]);
        ctx.lineTo(q.x + 0.01, q.y);
      }
      ctx.stroke();
    }
  });

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return toUnits(e.clientX - r.left, e.clientY - r.top);
  };

  return (
    <div ref={box} className={styles.pad}>
      <canvas
        ref={canvas}
        style={{ width: size.width, height: size.height }}
        aria-label={`Writing area for ${char}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          current.current = [point(e)];
          redraw((n) => n + 1);
        }}
        onPointerMove={(e) => {
          if (!current.current) return;
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
          const r = canvas.current!.getBoundingClientRect();
          for (const ev of events) current.current.push(toUnits(ev.clientX - r.left, ev.clientY - r.top));
          redraw((n) => n + 1);
        }}
        onPointerUp={() => {
          const s = current.current;
          current.current = null;
          if (s && s.length) onStroke(cleanStroke(s));
          redraw((n) => n + 1);
        }}
      />
    </div>
  );
}
