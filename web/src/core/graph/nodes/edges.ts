import type { Stroke } from "../../geometry";
import type { GrayImage } from "../types";

/** Separable Gaussian blur with standard deviation `sigma` (px), edges clamped. */
export function gaussianBlur(g: GrayImage, sigma: number): GrayImage {
  if (sigma <= 0) return g;
  const r = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((a, b) => a + b, 0);
  const k = kernel.map((v) => v / sum);
  const { width: w, height: h } = g;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * g.data[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = v;
    }
  }
  return { width: w, height: h, data: out };
}

export type CannyOptions = {
  /** Gaussian blur before the gradients, px. */
  sigma: number;
  /**
   * Strong edges: gradients above this percentile of all gradients in the image (0.85 = the top
   * 15 %). A percentile adapts to each picture; a fraction of the strongest edge does not, since a
   * single hard edge would push everything else below the threshold.
   */
  high: number;
  /** Weak edges, kept when connected to a strong one: this fraction of `high`. */
  low: number;
};

/**
 * Canny edge detector: Gaussian blur, Sobel gradients, non-maximum suppression (edges one pixel
 * thin), double threshold and hysteresis. Returns 1 for edge pixels.
 */
export function canny(g: GrayImage, o: CannyOptions): Uint8Array {
  const { width: w, height: h } = g;
  const s = gaussianBlur(g, o.sigma).data;
  const at = (x: number, y: number) => s[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  // Sobel
  const mag = new Float32Array(w * h);
  const dir = new Uint8Array(w * h); // 0: horizontal gradient, 1: 45°, 2: vertical, 3: 135°
  let max = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const m = Math.hypot(gx, gy);
      mag[y * w + x] = m;
      if (m > max) max = m;
      let a = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (a < 0) a += 180;
      dir[y * w + x] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }

  // non-maximum suppression along the gradient direction
  const STEP = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ];
  const thin = new Float32Array(w * h);
  const m = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mag[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = mag[y * w + x];
      if (v === 0) continue;
      const [dx, dy] = STEP[dir[y * w + x]];
      if (v >= m(x + dx, y + dy) && v > m(x - dx, y - dy)) thin[y * w + x] = v;
    }
  }

  // double threshold + hysteresis: weak pixels survive when connected to strong ones
  const edges = new Uint8Array(w * h);
  if (max === 0) return edges;
  const nonzero = Array.from(mag.filter((v) => v > 1e-6)).sort((a, b) => a - b);
  const hi = Math.max(1e-6, nonzero[Math.min(nonzero.length - 1, Math.floor(o.high * (nonzero.length - 1)))]);
  const lo = o.low * hi;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (thin[i] >= hi) {
      edges[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!edges[j] && thin[j] >= lo) {
          edges[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return edges;
}

// 4-neighbours first, so paths prefer straight steps over diagonal ones
const NEIGHBOURS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/**
 * Follows thin (1 px) edge pixels into polylines through the pixel centres. Paths start at line
 * ends first, so open edges become single strokes; closed loops are closed; branches end on the
 * line they join, so the drawing stays connected.
 */
export function traceEdges(mask: Uint8Array, w: number, h: number): Stroke[] {
  const visited = new Uint8Array(w * h);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const degree = (x: number, y: number) => NEIGHBOURS.reduce((n, [dx, dy]) => n + (on(x + dx, y + dy) ? 1 : 0), 0);
  const centre = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
  const strokes: Stroke[] = [];

  const walk = (sx: number, sy: number) => {
    const path: [number, number][] = [[sx, sy]];
    visited[sy * w + sx] = 1;
    let [x, y] = [sx, sy];
    for (;;) {
      const next = NEIGHBOURS.map(([dx, dy]) => [x + dx, y + dy]).find(([nx, ny]) => on(nx, ny) && !visited[ny * w + nx]);
      if (!next) break;
      [x, y] = next;
      visited[y * w + x] = 1;
      path.push([x, y]);
    }
    // close loops, and let branches end on the line they meet
    const prev = path[path.length - 2];
    const join = NEIGHBOURS.map(([dx, dy]) => [x + dx, y + dy]).find(
      ([nx, ny]) => on(nx, ny) && visited[ny * w + nx] && !(prev && prev[0] === nx && prev[1] === ny) && path.length > 2,
    );
    if (join) path.push(join as [number, number]);
    strokes.push(path.map(([px, py]) => centre(px, py)));
  };

  // line ends first, then whatever is left (loops)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && !visited[y * w + x] && degree(x, y) === 1) walk(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && !visited[y * w + x]) walk(x, y);
  return strokes;
}
