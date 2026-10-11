"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Simulation, stateAt, stats } from "@/core/sim";
import { drawPreview, drawProgress, drawSpeedGraph, fitView, speedColor, toCanvas } from "./render";
import styles from "./Simulator.module.css";

const SIZE = 800; // drawing canvas, CSS pixels
const GRAPH_H = 120;
const RATES = [1, 2, 5, 10, 30, 100];
const ZOOM_WINDOW = 4; // seconds shown in the detail graph
const PEN_WIDTH_MM = 0.7;

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

/** Sets up a canvas for the device pixel ratio and returns its context in CSS pixels. */
function context(canvas: HTMLCanvasElement | null, width: number, height: number) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const ink = (el: Element) => getComputedStyle(el).color;

/**
 * Plays back a simulation. With `liveTime` (a job is running on the plotter) the view can follow
 * the plotter's estimated position instead of the playback clock.
 */
export function Simulator({ sim, liveTime }: { sim: Simulation; liveTime?: number }) {
  const [trueWidth, setTrueWidth] = useState(true);
  const [ownTime, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(10);
  const [follow, setFollow] = useState(true);
  const following = liveTime !== undefined && follow;
  const time = following ? liveTime : ownTime;

  const summary = useMemo(() => stats(sim), [sim]);
  const view = useMemo(() => fitView(sim, SIZE, SIZE), [sim]);
  const maxDrawSpeed = useMemo(
    () => Math.max(1e-9, ...sim.events.map((e) => (e.kind === "move" && e.penDown ? e.profile.peak : 0))),
    [sim],
  );
  const t = Math.min(time, sim.duration);
  const state = stateAt(sim, t);

  const base = useRef<HTMLCanvasElement>(null);
  const progress = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const graph = useRef<HTMLCanvasElement>(null);
  const drawnUpTo = useRef(0);
  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  const lineWidth = trueWidth ? Math.max(1, PEN_WIDTH_MM * view.scale) : 1;

  // Static preview, and restart the progress layer whenever the simulation or line width changes.
  useEffect(() => {
    const ctx = context(base.current, SIZE, SIZE);
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    drawPreview(ctx, sim, view, ink(base.current!));
    context(progress.current, SIZE, SIZE)?.clearRect(0, 0, SIZE, SIZE);
    drawnUpTo.current = 0;
  }, [sim, view, lineWidth]);

  // Completed moves are drawn once onto the progress layer; the running move and the pen go on the overlay.
  useEffect(() => {
    const p = context(progress.current, SIZE, SIZE);
    const o = context(overlay.current, SIZE, SIZE);
    if (!p || !o) return;
    const index = Math.max(0, state.index);
    if (index < drawnUpTo.current) {
      p.clearRect(0, 0, SIZE, SIZE);
      drawnUpTo.current = 0;
    }
    drawProgress(p, sim, view, drawnUpTo.current, index, lineWidth, maxDrawSpeed);
    drawnUpTo.current = index;

    o.clearRect(0, 0, SIZE, SIZE);
    drawProgress(o, sim, view, 0, 0, lineWidth, maxDrawSpeed, { index, t });
    const pen = toCanvas(view, state.position);
    o.beginPath();
    o.arc(pen.x, pen.y, state.penDown ? 5 : 7, 0, 2 * Math.PI);
    o.lineWidth = 2;
    o.strokeStyle = state.penDown ? "crimson" : ink(overlay.current!);
    o.stroke();
  }, [sim, view, t, state.index, state.position, state.penDown, lineWidth, maxDrawSpeed]);

  // Speed graphs: whole job (click to seek) and a detail window around the current time.
  useEffect(() => {
    const el = graph.current;
    const width = el?.clientWidth || SIZE;
    const ctx = context(el, width, GRAPH_H * 2 + 16);
    if (!ctx || !el) return;
    const color = ink(el);
    const vmax = Math.max(summary.peakSpeed, 1e-9) * 1.1;
    ctx.clearRect(0, 0, width, GRAPH_H * 2 + 16);
    const boxes = [
      { box: { x: 0, y: 0, w: width, h: GRAPH_H }, t0: 0, t1: Math.max(sim.duration, 1e-9) },
      {
        box: { x: 0, y: GRAPH_H + 16, w: width, h: GRAPH_H },
        t0: t - ZOOM_WINDOW / 2,
        t1: t + ZOOM_WINDOW / 2,
      },
    ];
    for (const { box, t0, t1 } of boxes) {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = color;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      ctx.globalAlpha = 1;
      drawSpeedGraph(ctx, sim, box, t0, t1, vmax, speedColor(0.55));
      const cx = box.x + ((t - t0) / (t1 - t0)) * box.w;
      ctx.strokeStyle = "crimson";
      ctx.beginPath();
      ctx.moveTo(cx, box.y);
      ctx.lineTo(cx, box.y + box.h);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "11px var(--font-mono), monospace";
      ctx.fillText(`${vmax.toFixed(0)} mm/s`, box.x + 4, box.y + 12);
      ctx.fillText(t1 - t0 === ZOOM_WINDOW ? `±${ZOOM_WINDOW / 2} s` : "whole job", box.x + 4, box.y + box.h - 4);
    }
  }, [sim, t, summary.peakSpeed]);

  // Playback clock.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(timeRef.current + dt * rate, sim.duration);
      timeRef.current = next;
      setTime(next);
      if (next >= sim.duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, sim.duration]);

  const seekFromGraph = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientY - rect.top > GRAPH_H) return;
    setTime(((e.clientX - rect.left) / rect.width) * sim.duration);
  };

  return (
    <div className={styles.simulator}>
      {liveTime !== undefined && (
        <label className={styles.follow}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow the plotter (estimated from
          what it has received)
        </label>
      )}
      <div className={styles.controls}>
        <button
          type="button"
          disabled={following}
          onClick={() => {
            if (t >= sim.duration) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" disabled={following} onClick={() => setTime(0)}>
          Restart
        </button>
        <label>
          speed
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
        <input
          className={styles.scrubber}
          type="range"
          min={0}
          max={sim.duration}
          step={sim.duration / 2000 || 1}
          value={t}
          disabled={following}
          onChange={(e) => setTime(e.target.valueAsNumber)}
        />
        <span className={styles.mono}>
          {formatTime(t)} / {formatTime(sim.duration)}
        </span>
      </div>

      <div className={styles.status}>
        <span>
          x {state.position.x.toFixed(1)} mm · y {state.position.y.toFixed(1)} mm
        </span>
        <span>{state.speed.toFixed(1)} mm/s</span>
        <span>pen {state.penDown ? "down" : "up"}</span>
        <label>
          <input type="checkbox" checked={trueWidth} onChange={(e) => setTrueWidth(e.target.checked)} /> pen width{" "}
          {PEN_WIDTH_MM} mm
        </label>
      </div>

      <div className={styles.stage}>
        <canvas ref={base} style={{ width: SIZE, height: SIZE }} />
        <canvas ref={progress} style={{ width: SIZE, height: SIZE }} />
        <canvas ref={overlay} style={{ width: SIZE, height: SIZE }} />
      </div>

      <div className={styles.legend}>
        <span>0</span>
        <span className={styles.ramp} />
        <span>{maxDrawSpeed.toFixed(1)} mm/s (pen down, peak per move)</span>
      </div>

      <canvas ref={graph} className={styles.graph} style={{ height: GRAPH_H * 2 + 16 }} onClick={seekFromGraph} />

      <dl className={styles.stats}>
        <dt>total</dt>
        <dd>{formatTime(summary.duration)}</dd>
        <dt>drawing</dt>
        <dd>
          {formatTime(summary.drawTime)} · {(summary.drawDistance / 1000).toFixed(2)} m · avg {summary.drawSpeed.toFixed(1)}{" "}
          mm/s
        </dd>
        <dt>travel</dt>
        <dd>
          {formatTime(summary.travelTime)} · {(summary.travelDistance / 1000).toFixed(2)} m
        </dd>
        <dt>pen</dt>
        <dd>
          {formatTime(summary.penTime)} · {summary.penToggles} moves
        </dd>
        <dt>moves</dt>
        <dd>{summary.moves}</dd>
        <dt>peak speed</dt>
        <dd>{summary.peakSpeed.toFixed(1)} mm/s</dd>
        <dt>step rate</dt>
        <dd>
          x {(summary.maxStepRateX / 1000).toFixed(1)} kHz · y {(summary.maxStepRateY / 1000).toFixed(1)} kHz
        </dd>
      </dl>
    </div>
  );
}

