import type { Stroke } from "../geometry";
import type { GrayImage, Lines, PaperDrawing, RgbaImage, Value } from "./types";

/** What a node card shows: a small raster, or the paths (cheap enough to send whole). */
export type Thumb =
  | { kind: "raster"; width: number; height: number; data: Uint8ClampedArray }
  | { kind: "lines"; width: number; height: number; strokes: Stroke[] }
  | { kind: "drawing"; paper: { width: number; height: number }; strokes: Stroke[] };

export const THUMB_SIZE = 200;

const isGray = (v: Value): v is GrayImage => "data" in v && v.data instanceof Float32Array;
const isRgba = (v: Value): v is RgbaImage => "data" in v && v.data instanceof Uint8ClampedArray;

/** Nearest-neighbour shrink to at most `max` px on the longer side, as RGBA. */
function rasterThumb(width: number, height: number, max: number, pixel: (i: number) => [number, number, number, number]): Thumb {
  const scale = Math.max(1, Math.max(width, height) / max);
  const w = Math.max(1, Math.round(width / scale));
  const h = Math.max(1, Math.round(height / scale));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(y * scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(x * scale));
      data.set(pixel(sy * width + sx), (y * w + x) * 4);
    }
  }
  return { kind: "raster", width: w, height: h, data };
}

export function makeThumb(value: Value, max = THUMB_SIZE): Thumb {
  if ("paper" in value) {
    const d = value as PaperDrawing;
    return { kind: "drawing", paper: d.paper, strokes: d.strokes };
  }
  if ("strokes" in value) {
    const l = value as Lines;
    return { kind: "lines", width: l.width, height: l.height, strokes: l.strokes };
  }
  if (isGray(value)) {
    return rasterThumb(value.width, value.height, max, (i) => {
      const v = Math.round(value.data[i] * 255);
      return [v, v, v, 255];
    });
  }
  if (isRgba(value)) {
    const d = value.data;
    return rasterThumb(value.width, value.height, max, (i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]]);
  }
  throw new TypeError("no thumbnail for this value");
}
