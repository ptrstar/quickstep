import type { Point, Stroke } from "../../geometry";
import type { Lines } from "../types";
import { random } from "./stipple";

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** Moves strokes so their bounding box starts at a small padding, and returns that frame. */
export function framed(strokes: Stroke[], pad = 0.02): Lines {
  const pts = strokes.flat();
  if (pts.length === 0) return { width: 1, height: 1, strokes: [] };
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const size = Math.max(maxX - minX, maxY - minY, 1e-9);
  const m = pad * size;
  return {
    width: maxX - minX + 2 * m,
    height: maxY - minY + 2 * m,
    strokes: strokes.map((s) => s.map((p) => ({ x: p.x - minX + m, y: p.y - minY + m }))),
  };
}

/**
 * Spirograph: a wheel with `wheel` teeth rolls inside (hypotrochoid) or outside (epitrochoid) a
 * ring with `ring` teeth; the pen sits at `pen` × the wheel's radius from its centre. The curve
 * closes after wheel / gcd(ring, wheel) trips around the ring.
 */
export function spirograph(o: { ring: number; wheel: number; pen: number; outside: boolean; resolution: number }): Stroke {
  const R = o.ring;
  const r = o.wheel;
  const d = o.pen * r;
  const trips = r / gcd(R, r);
  const steps = Math.max(32, Math.round(trips * o.resolution));
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * trips * i) / steps;
    if (o.outside) {
      pts.push({ x: (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t), y: (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t) });
    } else {
      pts.push({ x: (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t), y: (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t) });
    }
  }
  return pts;
}

/**
 * Harmonograph: each axis is driven by two damped pendulums,
 * x(t) = e^(−dt) (sin(fx1·t) + sin(fx2·t + phase)), y likewise with a quarter-turn offset.
 * Frequencies a little off whole ratios make the figure drift and fill in.
 */
export function harmonograph(o: { fx1: number; fx2: number; fy1: number; fy2: number; phase: number; damping: number; duration: number; resolution: number }): Stroke {
  const steps = Math.max(100, Math.round(o.duration * o.resolution));
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = (o.duration * i) / steps;
    const decay = Math.exp(-o.damping * t);
    pts.push({
      x: decay * (Math.sin(o.fx1 * t) + Math.sin(o.fx2 * t + o.phase)),
      y: decay * (Math.sin(o.fy1 * t + Math.PI / 2) + Math.sin(o.fy2 * t + o.phase / 2)),
    });
  }
  return pts;
}

/**
 * Wave spiral: an Archimedean spiral whose radius wobbles with `waves` bumps per turn; the bumps
 * drift by `twist` of a wave per turn, so they line up into curved petals.
 */
export function waveSpiral(o: { turns: number; waves: number; amplitude: number; twist: number; resolution: number }): Stroke {
  const steps = Math.max(100, Math.round(o.turns * o.resolution));
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const turn = (o.turns * i) / steps; // 0 … turns
    const a = 2 * Math.PI * turn;
    const r = turn + o.amplitude * Math.sin(o.waves * a + 2 * Math.PI * o.twist * turn);
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}

/**
 * Whirl (pursuit polygons, "the mice problem"): a regular polygon, then one inside it whose
 * corners lie `step` of the way along each edge, and so on. The corners trace logarithmic spirals.
 */
export function whirl(o: { corners: number; levels: number; step: number; rotation: number }): Stroke[] {
  const n = Math.max(3, Math.round(o.corners));
  const a0 = (o.rotation * Math.PI) / 180 - Math.PI / 2;
  let poly: Point[] = Array.from({ length: n }, (_, k) => ({ x: Math.cos(a0 + (2 * Math.PI * k) / n), y: Math.sin(a0 + (2 * Math.PI * k) / n) }));
  const strokes: Stroke[] = [];
  for (let level = 0; level < o.levels; level++) {
    strokes.push([...poly, poly[0]]);
    poly = poly.map((p, k) => {
      const q = poly[(k + 1) % n];
      return { x: p.x + o.step * (q.x - p.x), y: p.y + o.step * (q.y - p.y) };
    });
  }
  return strokes;
}

export type RepeatOptions = {
  copies: number;
  rotate: number;
  scale: number;
  /** Random shift of each copy, as a fraction of the frame size. */
  jitter?: number;
  /** Random extra turn of each copy, ± degrees. */
  jitterTurn?: number;
  /** Random extra scale of each copy, ± fraction. */
  jitterScale?: number;
  seed?: number;
};

/**
 * Copies of the lines around the frame's centre, each turned by `rotate` degrees and scaled by
 * `scale` from the previous one: rosettes from any shape. Optional random offset, turn and scale
 * per copy (seeded, so it is reproducible). The frame grows to hold every copy.
 */
export function repeat(lines: Lines, o: RepeatOptions): Lines {
  const c = { x: lines.width / 2, y: lines.height / 2 };
  const size = Math.max(lines.width, lines.height);
  const rnd = random(o.seed ?? 1);
  const pm = () => 2 * rnd() - 1; // −1 … 1
  const out: Stroke[] = [];
  for (let k = 0; k < o.copies; k++) {
    const a = ((k * o.rotate + (o.jitterTurn ?? 0) * pm()) * Math.PI) / 180;
    const s = Math.pow(o.scale, k) * (1 + (o.jitterScale ?? 0) * pm());
    const ox = (o.jitter ?? 0) * size * pm();
    const oy = (o.jitter ?? 0) * size * pm();
    const cos = Math.cos(a) * s;
    const sin = Math.sin(a) * s;
    for (const st of lines.strokes) {
      out.push(st.map((p) => ({ x: c.x + ox + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + oy + (p.x - c.x) * sin + (p.y - c.y) * cos })));
    }
  }
  // keep the original centre in the middle of the new frame
  const pts = out.flat();
  const half = Math.max(lines.width / 2, lines.height / 2, ...pts.map((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y))));
  return { width: 2 * half, height: 2 * half, strokes: out.map((s) => s.map((p) => ({ x: p.x - c.x + half, y: p.y - c.y + half }))) };
}
