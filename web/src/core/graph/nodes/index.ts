import type { Stroke } from "../../geometry";
import type { Registry } from "../doc";
import type { GrayImage, Lines, NodeDef, PaperDrawing, RgbaImage } from "../types";
import { NeedsInput } from "../types";
import { optimizeStrokes, travelLength } from "./optimize";
import { PAPER_SIZES, paperSize } from "./paper";
import { mergeNode, postcardNode, textNode } from "./text";

export { PAPER_SIZES, paperSize };
import { boxBlur, contrast, downscale, grayscale, invert, sample } from "./pixels";

const px = (img: { width: number; height: number }) => `${img.width} × ${img.height} px`;
const count = (n: number) => n.toLocaleString("en").replace(/,/g, " ");

export function inkLength(strokes: Stroke[]): number {
  let total = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) total += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return total;
}

const image: NodeDef = {
  type: "image",
  label: "Image",
  description: "A picture you load. Downscaled for speed; the drawing does not need more detail.",
  inputs: [],
  outputs: [{ name: "image", type: "image" }],
  params: {
    asset: { kind: "asset", label: "Image", default: "" },
    maxSize: { kind: "number", label: "Max size", default: 600, min: 50, max: 3000, step: 50, unit: "px" },
  },
  compute(_, params, ctx) {
    const img = ctx.assets.get(params.asset as string);
    if (!img) throw new NeedsInput("load an image");
    return { image: downscale(img, params.maxSize as number) };
  },
  summary: (out) => px(out.image as RgbaImage),
};

const toGray: NodeDef = {
  type: "grayscale",
  label: "Grayscale",
  description: "Brightness of each pixel: 0 is black, 1 is white.",
  inputs: [{ name: "image", type: "image" }],
  outputs: [{ name: "gray", type: "gray" }],
  params: {},
  compute: (inp) => ({ gray: grayscale(inp.image as RgbaImage) }),
  summary: (out) => px(out.gray as GrayImage),
};

const invertNode: NodeDef = {
  type: "invert",
  label: "Invert",
  description: "Swaps dark and light.",
  inputs: [{ name: "gray", type: "gray" }],
  outputs: [{ name: "gray", type: "gray" }],
  params: {},
  compute: (inp) => ({ gray: invert(inp.gray as GrayImage) }),
};

const contrastNode: NodeDef = {
  type: "contrast",
  label: "Contrast",
  description: "Stretches the range between low and high to full black … white.",
  inputs: [{ name: "gray", type: "gray" }],
  outputs: [{ name: "gray", type: "gray" }],
  params: {
    low: { kind: "number", label: "Low", default: 0.2, min: 0, max: 1, step: 0.01 },
    high: { kind: "number", label: "High", default: 0.8, min: 0, max: 1, step: 0.01 },
  },
  compute: (inp, p) => ({ gray: contrast(inp.gray as GrayImage, p.low as number, p.high as number) }),
  summary: (_, p) => `${(p.low as number).toFixed(2)} → ${(p.high as number).toFixed(2)}`,
};

const blurNode: NodeDef = {
  type: "blur",
  label: "Blur",
  description: "Box blur: softens detail so lines follow larger shapes.",
  inputs: [{ name: "gray", type: "gray" }],
  outputs: [{ name: "gray", type: "gray" }],
  params: { radius: { kind: "number", label: "Radius", default: 2, min: 0, max: 30, step: 1, unit: "px" } },
  compute: (inp, p) => ({ gray: boxBlur(inp.gray as GrayImage, p.radius as number) }),
  summary: (_, p) => `radius ${p.radius} px`,
};

const amplifyLine: NodeDef = {
  type: "amplifyLine",
  label: "AmplifyLine",
  description: "Horizontal lines whose wiggle grows with darkness.",
  inputs: [{ name: "gray", type: "gray" }],
  outputs: [{ name: "lines", type: "lines" }],
  params: {
    lines: { kind: "number", label: "Lines", default: 40, min: 2, max: 300, step: 1 },
    samples: { kind: "number", label: "Points per line", default: 600, min: 10, max: 3000, step: 10 },
    waves: { kind: "number", label: "Waves per line", default: 60, min: 1, max: 500, step: 1 },
    amplitude: { kind: "number", label: "Amplitude", default: 0.45, min: 0, max: 1.5, step: 0.01, unit: "× spacing" },
    phase: { kind: "number", label: "Phase shift", default: 0.4, min: 0, max: 6.28, step: 0.01, unit: "rad/line" },
    direction: {
      kind: "select",
      label: "Direction",
      default: "alternate",
      options: [
        { value: "alternate", label: "alternate (fewer travel moves)" },
        { value: "ltr", label: "always left to right" },
      ],
    },
  },
  compute(inp, p) {
    const g = inp.gray as GrayImage;
    const n = p.lines as number;
    const samples = p.samples as number;
    const spacing = g.height / n;
    const amp = (p.amplitude as number) * spacing;
    const k = (2 * Math.PI * (p.waves as number)) / samples;
    const strokes: Stroke[] = [];
    for (let i = 0; i < n; i++) {
      const y0 = (i + 0.5) * spacing;
      const stroke: Stroke = [];
      for (let j = 0; j <= samples; j++) {
        const x = (g.width * j) / samples;
        const dark = 1 - sample(g, x, y0);
        stroke.push({ x, y: y0 + amp * dark * Math.sin(k * j + i * (p.phase as number)) });
      }
      if (p.direction === "alternate" && i % 2 === 1) stroke.reverse();
      strokes.push(stroke);
    }
    return { lines: { width: g.width, height: g.height, strokes } satisfies Lines };
  },
  summary: (out) => {
    const l = out.lines as Lines;
    return `${l.strokes.length} lines · ${count(l.strokes.reduce((n, s) => n + s.length, 0))} points`;
  },
};

const paper: NodeDef = {
  type: "paper",
  label: "Paper",
  description: "Fits the drawing onto the sheet inside the margin, centred. This is what gets plotted.",
  inputs: [{ name: "lines", type: "lines" }],
  outputs: [{ name: "drawing", type: "drawing" }],
  params: {
    size: { kind: "select", label: "Size", default: "a6", options: Object.entries(PAPER_SIZES).map(([value, s]) => ({ value, label: s.label })) },
    orientation: {
      kind: "select",
      label: "Orientation",
      default: "portrait",
      options: [
        { value: "portrait", label: "portrait" },
        { value: "landscape", label: "landscape" },
      ],
    },
    width: { kind: "number", label: "Width", default: 100, min: 10, max: 500, step: 1, unit: "mm", when: { param: "size", is: "custom" } },
    height: { kind: "number", label: "Height", default: 150, min: 10, max: 500, step: 1, unit: "mm", when: { param: "size", is: "custom" } },
    margin: { kind: "number", label: "Margin", default: 6, min: 0, max: 50, step: 0.5, unit: "mm" },
  },
  compute(inp, p) {
    const lines = inp.lines as Lines;
    const sheet = paperSize(p);
    const m = p.margin as number;
    const aw = Math.max(0, sheet.width - 2 * m);
    const ah = Math.max(0, sheet.height - 2 * m);
    const s = Math.min(aw / lines.width, ah / lines.height);
    const ox = m + (aw - lines.width * s) / 2;
    const oy = m + (ah - lines.height * s) / 2;
    const strokes = lines.strokes.map((st) => st.map((q) => ({ x: ox + q.x * s, y: oy + q.y * s })));
    return { drawing: { paper: sheet, strokes } satisfies PaperDrawing };
  },
  summary: (out) => {
    const d = out.drawing as PaperDrawing;
    return `${(inkLength(d.strokes) / 1000).toFixed(2)} m ink · ${d.strokes.length} strokes`;
  },
};

const points = (d: PaperDrawing) => d.strokes.reduce((n, s) => n + s.length, 0);

const optimize: NodeDef = {
  type: "optimize",
  label: "Optimize",
  description:
    "Makes the drawing cheaper to plot: wiggles too small to see become straight lines (fewer moves, same look), strokes are ordered to cut pen-up travel, tiny strokes can be dropped and near gaps joined. Smoothing trades detail for speed.",
  inputs: [{ name: "drawing", type: "drawing" }],
  outputs: [{ name: "drawing", type: "drawing" }],
  params: {
    flatten: { kind: "number", label: "Flatten wiggles under", default: 0.05, min: 0, max: 1, step: 0.01, unit: "mm" },
    minSpan: { kind: "number", label: "Only over at least", default: 1, min: 0.2, max: 10, step: 0.1, unit: "mm" },
    smooth: { kind: "number", label: "Smooth (changes the look)", default: 0, min: 0, max: 10, step: 1, unit: "points" },
    minLength: { kind: "number", label: "Drop strokes under", default: 0, min: 0, max: 10, step: 0.1, unit: "mm" },
    order: {
      kind: "select",
      label: "Stroke order",
      default: "nearest",
      options: [
        { value: "nearest", label: "shortest travel" },
        { value: "keep", label: "as drawn" },
      ],
    },
    join: { kind: "number", label: "Join gaps up to", default: 0, min: 0, max: 5, step: 0.1, unit: "mm" },
  },
  compute(inp, p) {
    const d = inp.drawing as PaperDrawing;
    const strokes = optimizeStrokes(d.strokes, {
      flatten: p.flatten as number,
      minSpan: p.minSpan as number,
      smooth: p.smooth as number,
      minLength: p.minLength as number,
      order: p.order === "nearest",
      join: p.join as number,
    });
    return { drawing: { paper: d.paper, strokes, notes: d.notes } satisfies PaperDrawing };
  },
  summary: (out, _, inp) => {
    const a = inp.drawing as PaperDrawing;
    const b = out.drawing as PaperDrawing;
    const m = (v: number) => (v / 1000).toFixed(2);
    return `${count(points(a))} → ${count(points(b))} pts · travel ${m(travelLength(a.strokes))} → ${m(travelLength(b.strokes))} m`;
  },
};

/** The pipeline's single output: whatever drawing is wired into it gets plotted. */
export const OUTPUT_TYPE = "output";
const outputNode: NodeDef = {
  type: OUTPUT_TYPE,
  label: "Output",
  description: "Whatever drawing is wired into this knob is what gets plotted.",
  inputs: [{ name: "drawing", type: "drawing" }],
  outputs: [],
  params: {},
  hidden: true,
  compute: () => ({}),
};

export const NODE_DEFS: NodeDef[] = [outputNode, image, toGray, invertNode, contrastNode, blurNode, amplifyLine, paper, textNode, postcardNode, mergeNode, optimize];

export const registry: Registry = new Map(NODE_DEFS.map((d) => [d.type, d]));
