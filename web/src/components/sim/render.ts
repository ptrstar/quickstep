import type { Point } from "@/core/geometry";
import { type MoveEvent, sample, type Simulation } from "@/core/sim";

// Viridis-like stops: slow = dark blue, fast = yellow. Readable on light and dark backgrounds.
const STOPS = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

/** Colour for a speed fraction 0…1. */
export function speedColor(f: number): string {
  const x = Math.min(1, Math.max(0, f)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const t = x - i;
  const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export type View = { scale: number; ox: number; oy: number };

const dotCache = new WeakMap<Simulation, Map<number, Point>>();

/**
 * Pen taps (dots): a pen-down event followed directly by a pen-up, with no move in between.
 * Keyed by the index of the pen-down event.
 */
export function dotsOf(sim: Simulation): Map<number, Point> {
  let dots = dotCache.get(sim);
  if (!dots) {
    dots = new Map();
    const ev = sim.events;
    for (let i = 0; i + 1 < ev.length; i++) {
      const a = ev[i];
      const b = ev[i + 1];
      if (a.kind === "pen" && a.down && b.kind === "pen" && !b.down) dots.set(i, a.at);
    }
    dotCache.set(sim, dots);
  }
  return dots;
}

function dot(ctx: CanvasRenderingContext2D, v: View, p: Point, lineWidth: number) {
  const c = toCanvas(v, p);
  const r = Math.max(0.75, lineWidth / 2);
  ctx.moveTo(c.x + r, c.y);
  ctx.arc(c.x, c.y, r, 0, 2 * Math.PI);
}

/**
 * Fits the sheet of paper (when given) or else all moves of the simulation into a canvas of the
 * given size, with a margin.
 */
export function fitView(sim: Simulation, width: number, height: number, paper?: { width: number; height: number }): View {
  let minX = 0;
  let minY = 0;
  let maxX = paper?.width ?? 0;
  let maxY = paper?.height ?? 0;
  for (const e of sim.events) {
    if (e.kind !== "move" || paper) continue;
    for (const p of [e.from, e.to]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const scale = Math.min((0.94 * width) / Math.max(maxX - minX, 1), (0.94 * height) / Math.max(maxY - minY, 1));
  return {
    scale,
    ox: (width - (maxX - minX) * scale) / 2 - minX * scale,
    oy: (height - (maxY - minY) * scale) / 2 - minY * scale,
  };
}

export const toCanvas = (v: View, p: Point): Point => ({ x: v.ox + p.x * v.scale, y: v.oy + p.y * v.scale });

/** Faint preview of everything: drawn lines solid, travel moves dashed. */
export function drawPreview(ctx: CanvasRenderingContext2D, sim: Simulation, v: View, ink: string) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const penDown of [true, false]) {
    ctx.beginPath();
    for (const e of sim.events) {
      if (e.kind !== "move" || e.penDown !== penDown) continue;
      const a = toCanvas(v, e.from);
      const b = toCanvas(v, e.to);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.globalAlpha = penDown ? 0.15 : 0.35;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.setLineDash(penDown ? [] : [3, 4]);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = ink;
  ctx.beginPath();
  for (const p of dotsOf(sim).values()) dot(ctx, v, p, 1.5);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws pen-down moves [from, to) in their speed colour. The move at `partialIndex` is drawn up
 * to time `t` only.
 */
export function drawProgress(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  v: View,
  from: number,
  to: number,
  lineWidth: number,
  maxSpeed: number,
  partial?: { index: number; t: number },
  /** A fixed colour (ink view) instead of colouring by speed. */
  color?: string,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = lineWidth;
  const line = (e: MoveEvent, end: Point) => {
    const a = toCanvas(v, e.from);
    const b = toCanvas(v, end);
    ctx.strokeStyle = color ?? speedColor(e.profile.peak / maxSpeed);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  const dots = dotsOf(sim);
  const dotColor = color ?? speedColor(0);
  ctx.fillStyle = dotColor;
  for (let i = from; i < to; i++) {
    const e = sim.events[i];
    if (e.kind === "move" && e.penDown) line(e, e.to);
    const d = dots.get(i);
    if (d) {
      ctx.beginPath();
      dot(ctx, v, d, lineWidth);
      ctx.fill();
    }
  }
  if (partial) {
    const d = dots.get(partial.index);
    if (d) {
      ctx.beginPath();
      dot(ctx, v, d, lineWidth);
      ctx.fill();
    }
    const e = sim.events[partial.index];
    if (e?.kind === "move" && e.penDown) {
      const f = sample(e.profile, partial.t - e.t0).distance / e.profile.length;
      line(e, { x: e.from.x + (e.to.x - e.from.x) * f, y: e.from.y + (e.to.y - e.from.y) * f });
    }
  }
  ctx.restore();
}

/**
 * Speed over time between t0 and t1 as a polyline through each profile's corner points
 * (start, end of acceleration, end of cruise, end), drawn into the given box.
 */
export function drawSpeedGraph(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  box: { x: number; y: number; w: number; h: number },
  t0: number,
  t1: number,
  maxSpeed: number,
  ink: string,
) {
  const tx = (t: number) => box.x + ((t - t0) / (t1 - t0)) * box.w;
  const vy = (v: number) => box.y + box.h - (v / maxSpeed) * box.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.lineWidth = 1.25;
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(tx(t0), vy(0));
  for (const e of sim.events) {
    const end = e.t0 + e.duration;
    if (end < t0) continue;
    if (e.t0 > t1) break;
    if (e.kind !== "move") {
      ctx.lineTo(tx(e.t0), vy(0));
      ctx.lineTo(tx(end), vy(0));
      continue;
    }
    const p = e.profile;
    ctx.lineTo(tx(e.t0), vy(p.entry));
    ctx.lineTo(tx(e.t0 + p.accelTime), vy(p.peak));
    ctx.lineTo(tx(e.t0 + p.accelTime + p.cruiseTime), vy(p.peak));
    ctx.lineTo(tx(end), vy(p.exit));
  }
  ctx.stroke();
  ctx.restore();
}
