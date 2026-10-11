import type { Point, Stroke } from "../../geometry";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from p to the segment a–b. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Straightens only the wiggles too small to matter. From each point, a straight line is extended
 * as far as every point in between stays within `tolerance` of it; it replaces those points only if
 * it reaches at least `minSpan`. Inside real wiggles no such line exists, so they keep every point
 * (simplifying them would turn smooth curves into sharp corners, which the plotter must slow for).
 */
export function flatten(points: Stroke, tolerance: number, minSpan: number): Stroke {
  if (points.length <= 2 || tolerance <= 0) return points;
  const within = (a: number, j: number) => {
    for (let k = a + 1; k < j; k++) if (segmentDistance(points[k], points[a], points[j]) > tolerance) return false;
    return true;
  };
  const out: Stroke = [points[0]];
  let a = 0;
  while (a < points.length - 1) {
    let j = a + 1;
    while (j + 1 < points.length && within(a, j + 1)) j++;
    const next = j > a + 1 && dist(points[a], points[j]) >= minSpan ? j : a + 1;
    out.push(points[next]);
    a = next;
  }
  return out;
}

/** Moving average over ±radius points; the endpoints stay where they are. */
export function smooth(points: Stroke, radius: number): Stroke {
  const r = Math.round(radius);
  if (r <= 0 || points.length <= 2) return points;
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    const lo = Math.max(0, i - r);
    const hi = Math.min(points.length - 1, i + r);
    let x = 0;
    let y = 0;
    for (let k = lo; k <= hi; k++) {
      x += points[k].x;
      y += points[k].y;
    }
    return { x: x / (hi - lo + 1), y: y / (hi - lo + 1) };
  });
}

export function strokeLength(s: Stroke): number {
  let l = 0;
  for (let i = 1; i < s.length; i++) l += dist(s[i - 1], s[i]);
  return l;
}

/** Pen-up distance: from `start` through every stroke in order, and back to `start`. */
export function travelLength(strokes: Stroke[], start: Point = { x: 0, y: 0 }): number {
  let at = start;
  let total = 0;
  for (const s of strokes) {
    if (s.length === 0) continue;
    total += dist(at, s[0]);
    at = s[s.length - 1];
  }
  return total + dist(at, start);
}

/**
 * Greedy nearest-neighbour order: from `start`, always draw the closest remaining stroke next,
 * reversed if its far end is closer. Never returns a longer travel than the original order.
 */
export function orderStrokes(strokes: Stroke[], start: Point = { x: 0, y: 0 }): Stroke[] {
  const left = strokes.filter((s) => s.length > 0);
  const out: Stroke[] = [];
  const used = new Uint8Array(left.length);
  let at = start;
  for (let n = 0; n < left.length; n++) {
    let best = -1;
    let bestD = Infinity;
    let reverse = false;
    for (let i = 0; i < left.length; i++) {
      if (used[i]) continue;
      const s = left[i];
      const d0 = dist(at, s[0]);
      const d1 = dist(at, s[s.length - 1]);
      if (d0 < bestD) {
        bestD = d0;
        best = i;
        reverse = false;
      }
      if (d1 < bestD) {
        bestD = d1;
        best = i;
        reverse = true;
      }
    }
    used[best] = 1;
    const s = reverse ? [...left[best]].reverse() : left[best];
    out.push(s);
    at = s[s.length - 1];
  }
  return travelLength(out, start) <= travelLength(left, start) ? out : left;
}

/** Joins each stroke to the previous one when the gap between them is at most `gap`. */
export function joinStrokes(strokes: Stroke[], gap: number): Stroke[] {
  if (gap <= 0) return strokes;
  const out: Stroke[] = [];
  for (const s of strokes) {
    const prev = out[out.length - 1];
    if (prev && s.length && dist(prev[prev.length - 1], s[0]) <= gap) out[out.length - 1] = [...prev, ...s];
    else out.push(s);
  }
  return out;
}

export type OptimizeOptions = {
  smooth: number;
  /** Wiggles smaller than this (mm) become straight lines. */
  flatten: number;
  /** Shortest straight line that may replace a run of points (mm). */
  minSpan: number;
  minLength: number;
  order: boolean;
  join: number;
};

/** The whole optimisation in its fixed order: smooth, flatten, drop tiny strokes, order, join. */
export function optimizeStrokes(strokes: Stroke[], o: OptimizeOptions, start: Point = { x: 0, y: 0 }): Stroke[] {
  let out = strokes.map((s) => flatten(smooth(s, o.smooth), o.flatten, o.minSpan));
  if (o.minLength > 0) out = out.filter((s) => strokeLength(s) >= o.minLength);
  if (o.order) out = orderStrokes(out, start);
  return joinStrokes(out, o.join);
}
