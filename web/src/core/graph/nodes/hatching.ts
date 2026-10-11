import type { Stroke } from "../../geometry";
import type { GrayImage } from "../types";
import { sample } from "./pixels";

export type HatchOptions = {
  /** Distance between parallel lines, px. */
  spacing: number;
  /** Number of line directions; each darker tone band adds one. */
  layers: number;
  /** Direction of the first layer, degrees (0 = horizontal). */
  angle: number;
  /** Turn between consecutive layers, degrees. */
  angleStep: number;
  /** The lightest tone (0 black … 1 white) that still gets hatched. */
  cutoff: number;
  /** Shorter segments are left out, px. */
  minLength: number;
};

/** Tone threshold of each layer: evenly spaced below the cutoff, lightest first. */
export function layerThresholds(layers: number, cutoff: number): number[] {
  return Array.from({ length: layers }, (_, k) => (cutoff * (layers - k)) / layers);
}

/**
 * Tonal cross-hatching. Layer k covers the image with parallel lines at angle + k·angleStep and
 * draws them only where the tone is darker than its threshold, so light areas get one direction and
 * the darkest get all of them. Lines alternate direction to keep the pen-up travel short.
 */
export function hatch(g: GrayImage, o: HatchOptions): Stroke[] {
  const strokes: Stroke[] = [];
  const thresholds = layerThresholds(o.layers, o.cutoff);
  const corners = [
    { x: 0, y: 0 },
    { x: g.width, y: 0 },
    { x: 0, y: g.height },
    { x: g.width, y: g.height },
  ];
  const step = 0.5; // sampling along a line, px

  thresholds.forEach((threshold, k) => {
    const a = ((o.angle + k * o.angleStep) * Math.PI) / 180;
    const d = { x: Math.cos(a), y: Math.sin(a) }; // along the lines
    const n = { x: -d.y, y: d.x }; // across them
    const across = corners.map((c) => c.x * n.x + c.y * n.y);
    const along = corners.map((c) => c.x * d.x + c.y * d.y);
    const t0 = Math.min(...along);
    const t1 = Math.max(...along);
    // shift each layer by a fraction of the spacing so layers do not share lines
    const offset = ((k + 0.5) / o.layers) * o.spacing;
    let line = 0;
    for (let s = Math.min(...across) + offset; s < Math.max(...across); s += o.spacing, line++) {
      const segments: Stroke[] = [];
      let current: Stroke | undefined;
      for (let t = t0; t <= t1 + 1e-9; t += step) {
        const p = { x: n.x * s + d.x * t, y: n.y * s + d.y * t };
        const inside = p.x >= 0 && p.y >= 0 && p.x <= g.width && p.y <= g.height;
        const dark = inside && sample(g, p.x, p.y) < threshold;
        if (dark) {
          if (current) current[1] = p;
          else current = [p, p];
        } else if (current) {
          segments.push(current);
          current = undefined;
        }
      }
      if (current) segments.push(current);
      const kept = segments.filter((seg) => Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y) >= o.minLength);
      if (line % 2 === 1) kept.reverse().forEach((seg) => seg.reverse());
      strokes.push(...kept);
    }
  });
  return strokes;
}
