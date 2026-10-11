import type { Stroke } from "../../geometry";

/** Marks every pixel a polyline passes through (sampled every half pixel). */
export function rasterize(strokes: Stroke[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const set = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix >= 0 && iy >= 0 && ix < w && iy < h) mask[iy * w + ix] = 1;
  };
  for (const s of strokes) {
    if (s.length === 1) set(s[0].x, s[0].y);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
      for (let k = 0; k <= n; k++) set(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    }
  }
  return mask;
}

/**
 * Approximate Euclidean distance (px) from every pixel to the nearest marked pixel: the two-pass
 * 3-4 chamfer transform, within about 8 % of the true distance.
 */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h).map((_, i) => (mask[i] ? 0 : INF));
  const relax = (i: number, x: number, y: number, dx: number, dy: number, cost: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const v = d[ny * w + nx] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      relax(i, x, y, -1, 0, 3);
      relax(i, x, y, 0, -1, 3);
      relax(i, x, y, -1, -1, 4);
      relax(i, x, y, 1, -1, 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      relax(i, x, y, 1, 0, 3);
      relax(i, x, y, 0, 1, 3);
      relax(i, x, y, 1, 1, 4);
      relax(i, x, y, -1, 1, 4);
    }
  }
  return d.map((v) => v / 3);
}
