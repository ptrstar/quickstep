import type { GrayImage, NodeDef } from "../types";
import { boxBlur, sample } from "./pixels";

const map = (g: GrayImage, f: (v: number) => number): GrayImage => ({ ...g, data: g.data.map(f) });
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export const BLEND_MODES = ["add", "subtract", "multiply", "screen", "difference", "darken", "lighten", "average"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/**
 * Combines two gray images pixel by pixel (0 black … 1 white). B is resampled to A's size.
 * `mix` fades from A (0) to the full result (1).
 */
export function combine(a: GrayImage, b: GrayImage, mode: BlendMode, mix = 1): GrayImage {
  const data = new Float32Array(a.data.length);
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = y * a.width + x;
      const va = a.data[i];
      const vb = b.width === a.width && b.height === a.height ? b.data[i] : sample(b, ((x + 0.5) * b.width) / a.width, ((y + 0.5) * b.height) / a.height);
      let r: number;
      switch (mode) {
        case "add":
          r = va + vb;
          break;
        case "subtract":
          r = va - vb;
          break;
        case "multiply":
          r = va * vb;
          break;
        case "screen":
          r = 1 - (1 - va) * (1 - vb);
          break;
        case "difference":
          r = Math.abs(va - vb);
          break;
        case "darken":
          r = Math.min(va, vb);
          break;
        case "lighten":
          r = Math.max(va, vb);
          break;
        default:
          r = (va + vb) / 2;
      }
      data[i] = clamp(va + (clamp(r) - va) * mix);
    }
  }
  return { width: a.width, height: a.height, data };
}

/** Black point, white point and gamma (midtones): v' = ((v − black) / (white − black)) ^ (1/gamma). */
export function levels(g: GrayImage, black: number, white: number, gamma: number): GrayImage {
  const span = Math.max(1e-6, white - black);
  return map(g, (v) => Math.pow(clamp((v - black) / span), 1 / gamma));
}

export function threshold(g: GrayImage, level: number): GrayImage {
  return map(g, (v) => (v < level ? 0 : 1));
}

/** Reduces to `steps` tones, evenly spaced from black to white. */
export function posterize(g: GrayImage, steps: number): GrayImage {
  const n = Math.max(2, Math.round(steps));
  return map(g, (v) => Math.round(v * (n - 1)) / (n - 1));
}

/** Unsharp mask: v + amount · (v − blurred). */
export function sharpen(g: GrayImage, amount: number, radius: number): GrayImage {
  const blurred = boxBlur(g, radius);
  return { ...g, data: g.data.map((v, i) => clamp(v + amount * (v - blurred.data[i]))) };
}

/** Cuts away the given fractions of each side. */
export function crop(g: GrayImage, left: number, top: number, right: number, bottom: number): GrayImage {
  const x0 = Math.floor(clamp(left) * g.width);
  const y0 = Math.floor(clamp(top) * g.height);
  const x1 = Math.max(x0 + 1, Math.ceil((1 - clamp(right)) * g.width));
  const y1 = Math.max(y0 + 1, Math.ceil((1 - clamp(bottom)) * g.height));
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) data.set(g.data.subarray((y0 + y) * g.width + x0, (y0 + y) * g.width + x0 + w), y * w);
  return { width: w, height: h, data };
}

/** Quarter turns clockwise, then an optional mirror left ↔ right. */
export function orient(g: GrayImage, quarterTurns: number, mirror: boolean): GrayImage {
  const q = ((Math.round(quarterTurns) % 4) + 4) % 4;
  const w = q % 2 ? g.height : g.width;
  const h = q % 2 ? g.width : g.height;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = mirror ? w - 1 - x : x;
      // source pixel of output (mx, y) after q clockwise quarter turns
      const [sx, sy] = q === 0 ? [mx, y] : q === 1 ? [y, g.height - 1 - mx] : q === 2 ? [g.width - 1 - mx, g.height - 1 - y] : [g.width - 1 - y, mx];
      data[y * w + x] = g.data[sy * g.width + sx];
    }
  }
  return { width: w, height: h, data };
}

/** Linear (at an angle) or radial gradient from `from` to `to`. */
export function gradient(width: number, height: number, kind: "linear" | "radial", angle: number, from: number, to: number): GrayImage {
  const data = new Float32Array(width * height);
  const a = (angle * Math.PI) / 180;
  const d = { x: Math.cos(a), y: Math.sin(a) };
  const corners = [0, width].flatMap((x) => [0, height].map((y) => x * d.x + y * d.y));
  const lo = Math.min(...corners);
  const hi = Math.max(...corners);
  const half = Math.hypot(width, height) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = kind === "radial" ? Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2) / half : ((x + 0.5) * d.x + (y + 0.5) * d.y - lo) / Math.max(1e-9, hi - lo);
      data[y * width + x] = from + (to - from) * clamp(t);
    }
  }
  return { width, height, data };
}

// ---- node definitions ----

const g1 = (name = "gray") => [{ name, type: "gray" as const }];

export const GRAY_NODES: NodeDef[] = [
  {
    type: "combine",
    label: "Combine",
    description: "Two gray images pixel by pixel: add, subtract, multiply, difference, darken, lighten… B is resized to A. Mix fades from A to the result.",
    inputs: [
      { name: "a", type: "gray" },
      { name: "b", type: "gray" },
    ],
    outputs: g1(),
    params: {
      mode: { kind: "select", label: "Mode", default: "subtract", options: BLEND_MODES.map((m) => ({ value: m, label: m })) },
      mix: { kind: "number", label: "Mix", default: 1, min: 0, max: 1, step: 0.01 },
    },
    compute: (inp, p) => ({ gray: combine(inp.a as GrayImage, inp.b as GrayImage, p.mode as BlendMode, p.mix as number) }),
    summary: (_, p) => String(p.mode),
  },
  {
    type: "levels",
    label: "Levels",
    description: "Black point, white point and gamma. Gamma above 1 lightens the midtones, below 1 darkens them.",
    inputs: g1(),
    outputs: g1(),
    params: {
      black: { kind: "number", label: "Black point", default: 0, min: 0, max: 1, step: 0.01 },
      white: { kind: "number", label: "White point", default: 1, min: 0, max: 1, step: 0.01 },
      gamma: { kind: "number", label: "Gamma", default: 1, min: 0.1, max: 5, step: 0.01 },
    },
    compute: (inp, p) => ({ gray: levels(inp.gray as GrayImage, p.black as number, p.white as number, p.gamma as number) }),
  },
  {
    type: "threshold",
    label: "Threshold",
    description: "Pure black and white: darker than the level becomes black.",
    inputs: g1(),
    outputs: g1(),
    params: { level: { kind: "number", label: "Level", default: 0.5, min: 0, max: 1, step: 0.01 } },
    compute: (inp, p) => ({ gray: threshold(inp.gray as GrayImage, p.level as number) }),
  },
  {
    type: "posterize",
    label: "Posterize",
    description: "Reduces the image to a few flat tones; clean bands for hatching.",
    inputs: g1(),
    outputs: g1(),
    params: { steps: { kind: "number", label: "Tones", default: 4, min: 2, max: 16, step: 1 } },
    compute: (inp, p) => ({ gray: posterize(inp.gray as GrayImage, p.steps as number) }),
  },
  {
    type: "sharpen",
    label: "Sharpen",
    description: "Unsharp mask: strengthens edges and fine detail.",
    inputs: g1(),
    outputs: g1(),
    params: {
      amount: { kind: "number", label: "Amount", default: 1, min: 0, max: 5, step: 0.05 },
      radius: { kind: "number", label: "Radius", default: 2, min: 1, max: 20, step: 1, unit: "px" },
    },
    compute: (inp, p) => ({ gray: sharpen(inp.gray as GrayImage, p.amount as number, p.radius as number) }),
  },
  {
    type: "crop",
    label: "Crop",
    description: "Cuts away part of each side, as a fraction of the image.",
    inputs: g1(),
    outputs: g1(),
    params: {
      left: { kind: "number", label: "Left", default: 0, min: 0, max: 0.9, step: 0.01 },
      top: { kind: "number", label: "Top", default: 0, min: 0, max: 0.9, step: 0.01 },
      right: { kind: "number", label: "Right", default: 0, min: 0, max: 0.9, step: 0.01 },
      bottom: { kind: "number", label: "Bottom", default: 0, min: 0, max: 0.9, step: 0.01 },
    },
    compute: (inp, p) => ({ gray: crop(inp.gray as GrayImage, p.left as number, p.top as number, p.right as number, p.bottom as number) }),
    summary: (out) => `${(out.gray as GrayImage).width} × ${(out.gray as GrayImage).height} px`,
  },
  {
    type: "orient",
    label: "Rotate / flip",
    description: "Quarter turns and mirroring.",
    inputs: g1(),
    outputs: g1(),
    params: {
      turns: {
        kind: "select",
        label: "Rotate",
        default: "0",
        options: [
          { value: "0", label: "0°" },
          { value: "1", label: "90° clockwise" },
          { value: "2", label: "180°" },
          { value: "3", label: "90° anticlockwise" },
        ],
      },
      mirror: { kind: "boolean", label: "Mirror", default: false },
    },
    compute: (inp, p) => ({ gray: orient(inp.gray as GrayImage, Number(p.turns), p.mirror as boolean) }),
  },
  {
    type: "gradient",
    label: "Gradient",
    description: "A linear or radial gradient, e.g. to Combine with an image for a vignette or a fade.",
    inputs: [],
    outputs: g1(),
    params: {
      kind: {
        kind: "select",
        label: "Kind",
        default: "radial",
        options: [
          { value: "radial", label: "radial (centre out)" },
          { value: "linear", label: "linear" },
        ],
      },
      angle: { kind: "number", label: "Angle", default: 90, min: 0, max: 360, step: 1, unit: "°" },
      from: { kind: "number", label: "From", default: 1, min: 0, max: 1, step: 0.01 },
      to: { kind: "number", label: "To", default: 0, min: 0, max: 1, step: 0.01 },
      width: { kind: "number", label: "Width", default: 400, min: 10, max: 2000, step: 10, unit: "px" },
      height: { kind: "number", label: "Height", default: 560, min: 10, max: 2000, step: 10, unit: "px" },
    },
    compute: (_, p) => ({ gray: gradient(p.width as number, p.height as number, p.kind as "radial", p.angle as number, p.from as number, p.to as number) }),
  },
];
