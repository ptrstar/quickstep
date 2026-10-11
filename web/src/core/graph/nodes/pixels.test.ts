import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { GrayImage, RgbaImage } from "../types";
import { boxBlur, contrast, downscale, grayscale, sample } from "./pixels";

const rgba = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): RgbaImage => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};

const grayArb = fc
  .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }))
  .chain(([w, h]) =>
    fc
      .array(fc.float({ min: 0, max: 1, noNaN: true }), { minLength: w * h, maxLength: w * h })
      .map((v): GrayImage => ({ width: w, height: h, data: Float32Array.from(v) })),
  );

/** The v1 BoxBlurGS loop, as the reference. */
function naiveBlur(g: GrayImage, r: number): Float32Array {
  const out = new Float32Array(g.data.length);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      let sum = 0;
      let c = 0;
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          if (x + i >= 0 && x + i < g.width && y + j >= 0 && y + j < g.height) {
            sum += g.data[(y + j) * g.width + x + i];
            c++;
          }
        }
      }
      out[y * g.width + x] = sum / c;
    }
  }
  return out;
}

describe("pixels", () => {
  it("grayscale is the mean of R, G, B; transparent becomes white paper", () => {
    const g = grayscale(rgba(3, 1, (x) => (x === 0 ? [255, 0, 0, 255] : x === 1 ? [30, 60, 90, 255] : [0, 0, 0, 0])));
    expect(g.data[0]).toBeCloseTo(1 / 3, 6);
    expect(g.data[1]).toBeCloseTo(60 / 255, 6);
    expect(g.data[2]).toBeCloseTo(1, 6);
  });

  it("contrast stretches low…high and clips", () => {
    const g: GrayImage = { width: 5, height: 1, data: Float32Array.of(0, 0.2, 0.5, 0.8, 1) };
    expect([...contrast(g, 0.2, 0.8).data].map((v) => +v.toFixed(6))).toEqual([0, 0, 0.5, 1, 1]);
    expect([...contrast(g, 0.5, 0.5).data]).toEqual([0, 0, 1, 1, 1]);
  });

  it("box blur matches the v1 algorithm for any radius", () => {
    fc.assert(
      fc.property(grayArb, fc.integer({ min: 0, max: 6 }), (g, r) => {
        const fast = boxBlur(g, r).data;
        const ref = r === 0 ? g.data : naiveBlur(g, r);
        fast.forEach((v, i) => expect(v).toBeCloseTo(ref[i], 4));
      }),
    );
  });

  it("downscale keeps the aspect ratio and the average brightness", () => {
    const img = rgba(400, 200, (x, y) => [(x * 7) % 256, (y * 3) % 256, 128, 255]);
    const small = downscale(img, 100);
    expect([small.width, small.height]).toEqual([100, 50]);
    const mean = (i: RgbaImage) => i.data.filter((_, k) => k % 4 === 0).reduce((s, v) => s + v, 0) / (i.width * i.height);
    expect(Math.abs(mean(small) - mean(img))).toBeLessThan(1); // pixels round to whole values
    expect(downscale(img, 1000)).toBe(img);
  });

  it("sampling at pixel centres returns the pixels", () => {
    fc.assert(
      fc.property(grayArb, (g) => {
        for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) expect(sample(g, x + 0.5, y + 0.5)).toBeCloseTo(g.data[y * g.width + x], 5);
      }),
    );
  });
});
