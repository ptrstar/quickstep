import type { Point } from "../../geometry";
import type { GrayImage } from "../types";

/** Small, fast, seedable random numbers (mulberry32), so the same settings give the same dots. */
export function random(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type StippleOptions = {
  points: number;
  /** Lloyd relaxation rounds. */
  iterations: number;
  /** Density = darkness ^ gamma; above 1 pushes dots into the darkest areas. */
  gamma: number;
  /** Tones lighter than this get no dots at all. */
  cutoff: number;
  seed: number;
};

/** Darkness-based density on a working grid of about `cells` pixels (the relaxation's cost). */
function densityGrid(g: GrayImage, o: StippleOptions, cells: number) {
  const scale = Math.min(1, Math.sqrt(cells / (g.width * g.height)));
  const w = Math.max(1, Math.round(g.width * scale));
  const h = Math.max(1, Math.round(g.height * scale));
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // average of the source pixels this cell covers
      const x0 = Math.floor((x * g.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * g.width) / w));
      const y0 = Math.floor((y * g.height) / h);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * g.height) / h));
      let sum = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) sum += g.data[sy * g.width + sx];
      const tone = sum / ((x1 - x0) * (y1 - y0));
      d[y * w + x] = tone >= o.cutoff ? 0 : Math.pow(1 - tone, o.gamma);
    }
  }
  return { w, h, d, sx: g.width / w, sy: g.height / h };
}

/** Uniform grid over the points for nearest-point queries. */
export class PointGrid {
  private cells: number[][];
  private cols: number;
  private rows: number;
  constructor(
    private pts: Point[],
    w: number,
    h: number,
    private size: number,
  ) {
    this.cols = Math.max(1, Math.ceil(w / size));
    this.rows = Math.max(1, Math.ceil(h / size));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    pts.forEach((p, i) => this.cells[this.cell(p.x, p.y)].push(i));
  }
  private cell(x: number, y: number) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.size)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.size)));
    return cy * this.cols + cx;
  }
  /** Index of the nearest point: search rings of cells until no closer point can exist. */
  nearest(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.size)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.size)));
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; ; r++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= this.rows) continue;
        for (let gx = cx - r; gx <= cx + r; gx++) {
          if (gx < 0 || gx >= this.cols) continue;
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue; // ring only
          for (const i of this.cells[gy * this.cols + gx]) {
            const d = (this.pts[i].x - x) ** 2 + (this.pts[i].y - y) ** 2;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
        }
      }
      // every point in ring r+1 is at least r·size away
      if (best >= 0 && bestD <= (r * this.size) ** 2) return best;
      if (r > this.cols + this.rows) return best;
    }
  }
}

/**
 * Weighted Voronoi stippling (Secord 2002): dots scattered by darkness, then Lloyd-relaxed: each
 * dot moves to the darkness-weighted centroid of the area nearest to it. Returns dots in the
 * gray image's pixel frame, and the density at each dot (0…1) for sizing.
 */
export function stipple(g: GrayImage, o: StippleOptions): { points: Point[]; density: number[] } {
  const grid = densityGrid(g, o, Math.min(400_000, Math.max(40_000, o.points * 60)));
  const { w, h, d } = grid;
  const total = d.reduce((a, v) => a + v, 0);
  if (total === 0 || o.points <= 0) return { points: [], density: [] };

  // initial dots: inverse-transform sampling of the density, so every dot lands on the first try
  // (rejection sampling runs out of tries on mostly light pictures and returns too few dots)
  const rnd = random(o.seed);
  const cumulative = new Float64Array(w * h);
  let acc = 0;
  for (let i = 0; i < w * h; i++) cumulative[i] = acc += d[i];
  let pts: Point[] = [];
  for (let k = 0; k < o.points; k++) {
    const u = rnd() * acc;
    let lo = 0;
    let hi = w * h - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] > u) hi = mid;
      else lo = mid + 1;
    }
    pts.push({ x: (lo % w) + rnd(), y: Math.floor(lo / w) + rnd() });
  }

  // Lloyd relaxation on the discrete weighted Voronoi diagram
  const cellSize = Math.max(1, Math.sqrt((w * h) / pts.length));
  for (let it = 0; it < o.iterations; it++) {
    const index = new PointGrid(pts, w, h, cellSize);
    const sx = new Float64Array(pts.length);
    const sy = new Float64Array(pts.length);
    const sw = new Float64Array(pts.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = d[y * w + x];
        if (v === 0) continue;
        const i = index.nearest(x + 0.5, y + 0.5);
        sx[i] += v * (x + 0.5);
        sy[i] += v * (y + 0.5);
        sw[i] += v;
      }
    }
    pts = pts.map((p, i) => (sw[i] > 0 ? { x: sx[i] / sw[i], y: sy[i] / sw[i] } : p));
  }

  const density = pts.map((p) => d[Math.min(h - 1, Math.floor(p.y)) * w + Math.min(w - 1, Math.floor(p.x))]);
  return { points: pts.map((p) => ({ x: p.x * grid.sx, y: p.y * grid.sy })), density };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function tourLength(tour: Point[]): number {
  let l = 0;
  for (let i = 1; i < tour.length; i++) l += dist(tour[i - 1], tour[i]);
  return l;
}

/**
 * A short open path through all points (TSP art, Kaplan & Bosch 2005): nearest-neighbour tour,
 * improved by 2-opt moves until no reversal shortens it (or `passes` run out).
 */
export function tour(points: Point[], passes = 8): Point[] {
  if (points.length < 3) return [...points];
  // nearest neighbour, accelerated with a grid that forgets visited points
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const size = Math.max(1e-9, Math.sqrt(((Math.max(...xs) - minX + 1) * (Math.max(...ys) - minY + 1)) / n));
  const cols = Math.ceil((Math.max(...xs) - minX + 1) / size) + 1;
  const rows = Math.ceil((Math.max(...ys) - minY + 1) / size) + 1;
  const cells: Set<number>[] = Array.from({ length: cols * rows }, () => new Set());
  const cellOf = (i: number) => Math.floor((ys[i] - minY) / size) * cols + Math.floor((xs[i] - minX) / size);
  for (let i = 0; i < n; i++) cells[cellOf(i)].add(i);

  const order: number[] = [0];
  cells[cellOf(0)].delete(0);
  for (let k = 1; k < n; k++) {
    const cur = order[order.length - 1];
    const cx = Math.floor((xs[cur] - minX) / size);
    const cy = Math.floor((ys[cur] - minY) / size);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= cols + rows; r++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= rows) continue;
        for (let gx = cx - r; gx <= cx + r; gx++) {
          if (gx < 0 || gx >= cols || Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
          for (const i of cells[gy * cols + gx]) {
            const dd = (xs[i] - xs[cur]) ** 2 + (ys[i] - ys[cur]) ** 2;
            if (dd < bestD) {
              bestD = dd;
              best = i;
            }
          }
        }
      }
      if (best >= 0 && bestD <= (r * size) ** 2) break;
    }
    order.push(best);
    cells[cellOf(best)].delete(best);
  }

  // 2-opt: reverse order[i+1..j] when that shortens the path
  const p = order.map((i) => points[i]);
  const window = Math.min(n - 1, 60); // only look at nearby positions in the tour; keeps it fast
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 2; j < Math.min(n - 1, i + window); j++) {
        const before = dist(p[i], p[i + 1]) + dist(p[j], p[j + 1]);
        const after = dist(p[i], p[j]) + dist(p[i + 1], p[j + 1]);
        if (after < before - 1e-9) {
          for (let a = i + 1, b = j; a < b; a++, b--) [p[a], p[b]] = [p[b], p[a]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return p;
}
