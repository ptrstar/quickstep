"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Simulation, stateAt, stats } from "@/core/sim";
import { drawPreview, drawProgress, drawSpeedGraph, fitView, speedColor, toCanvas } from "../sim/render";
import type { Playback } from "./usePlayback";
import styles from "./PlotView.module.css";

const GRAPH_H = 96;
const ZOOM_WINDOW = 4; // seconds in the detail graph
const RATES = [1, 2, 5, 10, 30, 100];
const PEN_MM = 0.35;
const INK = "#1b1d22";

export function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

/** Canvas sized for the device pixel ratio; returns its context in CSS pixels. */
function context(canvas: HTMLCanvasElement | null, width: number, height: number) {
  if (!canvas || width <= 0 || height <= 0) return null;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

type Props = {
  sim: Simulation;
  paper?: { width: number; height: number };
  playback: Playback;
  /** The plotter's estimated position while a job runs. */
  liveTime?: number;
  title: string;
};

/**
 * The job on its paper (ink or speed colours), playback with scrubbing, and two speed graphs:
 * the whole job (click to jump) and ±2 s around the current time.
 */
export function PlotView({ sim, paper, playback, liveTime, title }: Props) {
  const [mode, setMode] = useState<"ink" | "speed">("speed");
  const [follow, setFollow] = useState(true);
  const following = liveTime !== undefined && follow;
  const t = Math.min(following ? liveTime : playback.time, sim.duration);
  const state = stateAt(sim, t);
  const summary = useMemo(() => stats(sim), [sim]);
  const maxDrawSpeed = useMemo(() => Math.max(1e-9, ...sim.events.map((e) => (e.kind === "move" && e.penDown ? e.profile.peak : 0))), [sim]);

  const [stageRef, size] = useSize<HTMLDivElement>();
  const view = useMemo(() => fitView(sim, size.width, size.height, paper), [sim, size, paper]);
  const lineWidth = Math.max(0.75, PEN_MM * view.scale);
  const color = mode === "ink" ? INK : undefined;

  const base = useRef<HTMLCanvasElement>(null);
  const progress = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const graph = useRef<HTMLCanvasElement>(null);
  const drawnUpTo = useRef(0);

  // sheet + faint preview of everything; restart the progress layer when anything changes
  useEffect(() => {
    const ctx = context(base.current, size.width, size.height);
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    if (paper) {
      const a = toCanvas(view, { x: 0, y: 0 });
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#fbfbf8";
      ctx.fillRect(a.x, a.y, paper.width * view.scale, paper.height * view.scale);
      ctx.restore();
    }
    drawPreview(ctx, sim, view, paper ? INK : "#c5cad3");
    context(progress.current, size.width, size.height)?.clearRect(0, 0, size.width, size.height);
    drawnUpTo.current = 0;
  }, [sim, view, size, paper, lineWidth, mode]);

  // finished moves go onto the progress layer once; the running move and the pen on the overlay
  useEffect(() => {
    const p = context(progress.current, size.width, size.height);
    const o = context(overlay.current, size.width, size.height);
    if (!p || !o) return;
    const index = Math.max(0, state.index);
    if (index < drawnUpTo.current) {
      p.clearRect(0, 0, size.width, size.height);
      drawnUpTo.current = 0;
    }
    drawProgress(p, sim, view, drawnUpTo.current, index, lineWidth, maxDrawSpeed, undefined, color);
    drawnUpTo.current = index;
    o.clearRect(0, 0, size.width, size.height);
    drawProgress(o, sim, view, 0, 0, lineWidth, maxDrawSpeed, { index, t }, color);
    const pen = toCanvas(view, state.position);
    o.beginPath();
    o.arc(pen.x, pen.y, state.penDown ? 5 : 7, 0, 2 * Math.PI);
    o.lineWidth = 2;
    o.strokeStyle = "#e5484d";
    o.stroke();
  }, [sim, view, size, t, state.index, state.position, state.penDown, lineWidth, maxDrawSpeed, color]);

  // speed graphs
  const [graphRef, graphSize] = useSize<HTMLDivElement>();
  useEffect(() => {
    const width = graphSize.width;
    const height = GRAPH_H * 2 + 12;
    const ctx = context(graph.current, width, height);
    if (!ctx) return;
    const vmax = Math.max(summary.peakSpeed, 1e-9) * 1.1;
    ctx.clearRect(0, 0, width, height);
    const boxes = [
      { box: { x: 0, y: 0, w: width, h: GRAPH_H }, t0: 0, t1: Math.max(sim.duration, 1e-9), label: "whole job · click to jump" },
      { box: { x: 0, y: GRAPH_H + 12, w: width, h: GRAPH_H }, t0: t - ZOOM_WINDOW / 2, t1: t + ZOOM_WINDOW / 2, label: `±${ZOOM_WINDOW / 2} s` },
    ];
    for (const { box, t0, t1, label } of boxes) {
      ctx.fillStyle = "#15181c";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      drawSpeedGraph(ctx, sim, box, t0, t1, vmax, speedColor(0.55));
      const cx = box.x + ((t - t0) / (t1 - t0)) * box.w;
      ctx.strokeStyle = "#e5484d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, box.y);
      ctx.lineTo(cx, box.y + box.h);
      ctx.stroke();
      ctx.fillStyle = "#a3aab6";
      ctx.font = "11px var(--font-mono), monospace";
      ctx.fillText(`${vmax.toFixed(0)} mm/s`, box.x + 6, box.y + 14);
      ctx.fillText(label, box.x + 6, box.y + box.h - 6);
    }
  }, [sim, t, summary.peakSpeed, graphSize]);

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientY - r.top > GRAPH_H) return;
    setFollow(false);
    playback.setTime(((e.clientX - r.left) / r.width) * sim.duration);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.bar}>
        <strong>{title}</strong>
        {liveTime !== undefined && (
          <label className={styles.follow}>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow the plotter
          </label>
        )}
        <span className={styles.readout}>
          {state.speed.toFixed(0)} mm/s · pen {state.penDown ? "down" : "up"}
        </span>
        <div className={styles.toggle} role="group" aria-label="Colouring">
          <button type="button" aria-pressed={mode === "ink"} onClick={() => setMode("ink")}>
            Ink
          </button>
          <button type="button" aria-pressed={mode === "speed"} onClick={() => setMode("speed")}>
            Speed
          </button>
        </div>
      </div>

      <div ref={stageRef} className={styles.stage}>
        <canvas ref={base} style={{ width: size.width, height: size.height }} />
        <canvas ref={progress} style={{ width: size.width, height: size.height }} />
        <canvas ref={overlay} style={{ width: size.width, height: size.height }} aria-label="Plot preview" />
        {mode === "speed" && (
          <div className={styles.legend} aria-hidden="true">
            <span>{maxDrawSpeed.toFixed(0)} mm/s</span>
            <span className={styles.ramp} />
            <span>0</span>
          </div>
        )}
      </div>

      <div className={styles.transport}>
        <button type="button" disabled={following} onClick={() => (playback.playing ? playback.pause() : playback.play())} aria-label={playback.playing ? "Pause simulation" : "Play simulation"}>
          {playback.playing ? "❚❚" : "▶"}
        </button>
        <select value={playback.rate} onChange={(e) => playback.setRate(Number(e.target.value))} aria-label="Playback speed" disabled={following}>
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <input
          type="range"
          min={0}
          max={sim.duration}
          step={sim.duration / 2000 || 1}
          value={t}
          aria-label="Simulation time"
          onChange={(e) => {
            setFollow(false);
            playback.setTime(e.target.valueAsNumber);
          }}
        />
        <span className={styles.time}>
          {formatTime(t)} / {formatTime(sim.duration)}
        </span>
      </div>

      <div ref={graphRef} className={styles.graphs}>
        <canvas ref={graph} style={{ width: graphSize.width, height: GRAPH_H * 2 + 12 }} onClick={seek} />
      </div>
    </section>
  );
}
