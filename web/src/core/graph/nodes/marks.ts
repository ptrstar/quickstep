import type { Point, Stroke } from "../../geometry";
import type { Marks } from "../types";

/** Closed regular polygon around `c` (first corner at `rotation` degrees from the +x axis). */
export function polygon(c: Point, r: number, corners: number, rotation = 0): Stroke {
  const n = Math.max(3, Math.round(corners));
  const a0 = (rotation * Math.PI) / 180;
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + (2 * Math.PI * (k % n)) / n;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

/** Corners for a circle of radius r (mm) so each side is about 0.25 mm, never fewer than 12. */
export const circleCorners = (r: number) => Math.max(12, Math.ceil((2 * Math.PI * r) / 0.25));

/** Radius of mark i in mm: area grows with `size`, so tone reads true (r = min…max by √size). */
export function markRadius(m: Marks, i: number): number {
  const s = Math.min(1, Math.max(0, m.sizes[i] ?? 1));
  return m.minRadius + (m.maxRadius - m.minRadius) * Math.sqrt(s);
}

/** Replaces one-point strokes (already in mm) with their marks; other strokes pass through. */
export function drawMarks(strokes: Stroke[], m: Marks): Stroke[] {
  return strokes.map((s, i) => {
    if (s.length !== 1) return s;
    const r = markRadius(m, i);
    if (r <= 0) return s;
    return polygon(s[0], r, m.shape === "circle" ? circleCorners(r) : m.corners, m.rotation);
  });
}
