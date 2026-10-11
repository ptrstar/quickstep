import type { GrayImage, RgbaImage } from "../types";

/** Shrinks an image so its longer side is at most `maxSide`, averaging the covered pixels. */
export function downscale(img: RgbaImage, maxSide: number): RgbaImage {
  const scale = Math.max(img.width, img.height) / maxSide;
  if (scale <= 1) return img;
  const width = Math.max(1, Math.round(img.width / scale));
  const height = Math.max(1, Math.round(img.height / scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * img.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * img.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / width));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 4;
          for (let c = 0; c < 4; c++) sum[c] += img.data[i + c];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[o + c] = Math.round(sum[c] / n);
    }
  }
  return { width, height, data };
}

/** Mean of R, G, B (as in v1), composited over white paper where the image is transparent. */
export function grayscale(img: RgbaImage): GrayImage {
  const data = new Float32Array(img.width * img.height);
  for (let i = 0; i < data.length; i++) {
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    const a = img.data[i * 4 + 3] / 255;
    data[i] = (a * (r + g + b)) / (3 * 255) + (1 - a);
  }
  return { width: img.width, height: img.height, data };
}

export function invert(g: GrayImage): GrayImage {
  return { ...g, data: g.data.map((v) => 1 - v) };
}

/** Stretches [low, high] to [0, 1] and clips the rest (v1 ContrastGS). */
export function contrast(g: GrayImage, low: number, high: number): GrayImage {
  const span = high - low;
  return {
    ...g,
    data: g.data.map((v) => (span <= 0 ? (v < low ? 0 : 1) : Math.min(1, Math.max(0, (v - low) / span)))),
  };
}

/**
 * Box blur over a (2r+1)² window; at the edges the mean is over the pixels inside the image
 * (v1 BoxBlurGS). Separable with running sums, so the cost does not grow with the radius.
 */
export function boxBlur(g: GrayImage, radius: number): GrayImage {
  const r = Math.round(radius);
  if (r <= 0) return g;
  const { width: w, height: h } = g;
  const pass = (src: Float32Array, len: number, lines: number, stride: number, step: number) => {
    const out = new Float32Array(src.length);
    for (let l = 0; l < lines; l++) {
      const base = l * stride;
      let sum = 0;
      for (let k = 0; k <= Math.min(r, len - 1); k++) sum += src[base + k * step];
      for (let k = 0; k < len; k++) {
        const lo = Math.max(0, k - r);
        const hi = Math.min(len - 1, k + r);
        out[base + k * step] = sum / (hi - lo + 1);
        if (k + r + 1 < len) sum += src[base + (k + r + 1) * step];
        if (k - r >= 0) sum -= src[base + (k - r) * step];
      }
    }
    return out;
  };
  const horizontal = pass(g.data, w, h, w, 1);
  return { width: w, height: h, data: pass(horizontal, h, w, 1, w) };
}

/** Bilinear sample at continuous pixel coordinates (pixel centres at +0.5), clamped to the edge. */
export function sample(g: GrayImage, x: number, y: number): number {
  const fx = Math.min(g.width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(g.height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(g.width - 1, x0 + 1);
  const y1 = Math.min(g.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (xx: number, yy: number) => g.data[yy * g.width + xx];
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}
