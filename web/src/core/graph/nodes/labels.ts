import type { Point, Stroke } from "../../geometry";
import { DEFAULT_FONT } from "../../text/builtin";
import type { Font } from "../../text/font";
import { layoutText } from "../../text/layout";
import type { ComputeContext, Lines, NodeDef, PaperDrawing } from "../types";
import { NeedsInput } from "../types";
import { framed } from "./generative";
import { paperSize } from "./paper";
import { ellipse, SHEET_PARAMS } from "./shapes";
import { random } from "./stipple";

export type SnowflakeOptions = {
  /** Side branches on each arm. */
  branches: number;
  /** 1: branches only; 2: branches get their own twigs. */
  detail: number;
  seed: number;
};

const turn = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const mirrorY = (s: Stroke): Stroke => s.map((p) => ({ x: p.x, y: -p.y }));

/**
 * A procedural snowflake of radius about 1 around (0, 0): one arm is grown at random from `seed`
 * (side branches at 60°, optional twigs, a centre hexagon, tip shapes), mirrored, and repeated six
 * times, so every seed gives a different flake with true six-fold symmetry.
 */
export function snowflake(o: SnowflakeOptions): Stroke[] {
  const rnd = random(o.seed * 7919 + 13);
  const half: Stroke[] = []; // one side of one arm, y ≥ 0 (mirrored below)
  const arm: Stroke[] = [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  ];
  const dir = { x: Math.cos(Math.PI / 3), y: Math.sin(Math.PI / 3) };
  const n = Math.max(0, Math.round(o.branches));
  for (let i = 0; i < n; i++) {
    const t = 0.22 + ((0.7 - 0.22) * (i + 0.2 + 0.6 * rnd())) / Math.max(1, n);
    const len = (1 - t) * (0.3 + 0.45 * rnd());
    const base = { x: t, y: 0 };
    const tip = { x: t + dir.x * len, y: dir.y * len };
    half.push([base, tip]);
    if (o.detail >= 2 && len > 0.12) {
      // twigs from the branch's middle, parallel to the main arm and outward
      const m = 0.45 + 0.25 * rnd();
      const at = { x: t + dir.x * len * m, y: dir.y * len * m };
      const twig = len * (0.3 + 0.2 * rnd());
      half.push([at, { x: at.x + twig, y: at.y }]);
    }
  }
  // tip: a small diamond or a fork, decided by the seed
  const tipStyle = rnd();
  if (tipStyle < 0.4) {
    const s = 0.06 + 0.05 * rnd();
    half.push([
      { x: 1 - s, y: 0 },
      { x: 1, y: s },
      { x: 1 + s, y: 0 },
    ]);
  } else if (tipStyle < 0.75) {
    const f = 0.12 + 0.08 * rnd();
    half.push([
      { x: 1 - f, y: 0 },
      { x: 1 - f + dir.x * f, y: dir.y * f },
    ]);
  }
  arm.push(...half, ...half.map(mirrorY));

  const strokes: Stroke[] = [];
  for (let k = 0; k < 6; k++) for (const s of arm) strokes.push(s.map((p) => turn(p, (k * Math.PI) / 3)));
  // centre hexagon in some flakes
  if (rnd() < 0.6) {
    const r = 0.12 + 0.12 * rnd();
    strokes.push(Array.from({ length: 7 }, (_, k) => turn({ x: r, y: 0 }, (k * Math.PI) / 3)));
  }
  return strokes;
}

const fontOf = (ctx: ComputeContext, key: unknown): Font => {
  const font = ctx.fonts?.get(String(key));
  if (!font) throw new NeedsInput("loading font");
  return font;
};

export type LabelOptions = {
  width: number;
  height: number;
  /** Size of the cut-off corner (top left), mm. */
  chamfer: number;
  hole: boolean;
  holeRadius: number;
  snowflake: boolean;
  flakeSize: number;
  textSize: number;
  seed: number;
  outline: boolean;
};

/** Outline of one label at (0, 0): a rectangle with its top-left corner cut off diagonally. */
export function labelOutline(w: number, h: number, c: number): Stroke {
  const k = Math.max(0, Math.min(c, w / 2, h / 2));
  return [
    { x: k, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
    { x: 0, y: k },
    { x: k, y: 0 },
  ];
}

/** One label: outline, string hole at the cut corner, the name, and its own snowflake. */
export function labelStrokes(name: string, index: number, o: LabelOptions, font: Font): { strokes: Stroke[]; missing: string[] } {
  const strokes: Stroke[] = [];
  if (o.outline) strokes.push(labelOutline(o.width, o.height, o.chamfer));

  // hole near the cut corner, well inside the label
  const hc = Math.max(o.chamfer * 0.85, o.holeRadius + 2.5);
  if (o.hole) strokes.push(ellipse(hc, hc, o.holeRadius, o.holeRadius));

  // snowflake on the right, its seed different for every label
  const flakeR = Math.min(o.flakeSize / 2, o.height / 2 - 2.5);
  const flakeX = o.width - 2.5 - flakeR;
  if (o.snowflake && flakeR > 0.5) {
    const flake = snowflake({ branches: 2 + ((o.seed + index) % 3), detail: 2, seed: o.seed * 1000 + index });
    strokes.push(...flake.map((s) => s.map((p) => ({ x: flakeX + p.x * flakeR, y: o.height / 2 + p.y * flakeR }))));
  }

  // name: between the hole and the snowflake, shrunk to fit, centred vertically
  const left = o.hole ? hc + o.holeRadius + 2.5 : Math.max(3, o.chamfer * 0.6);
  const right = o.snowflake ? flakeX - flakeR - 2.5 : o.width - 3;
  const box = Math.max(1, right - left);
  let size = o.textSize;
  const natural = layoutText(name, font, { size, lineHeight: 1.2, align: "left", width: 0 }).width;
  if (natural > box) size *= box / natural;
  const l = layoutText(name, font, { size, lineHeight: 1.2, align: "center", width: box }, { x: left, y: o.height / 2 - ((font.ascent + font.descent) * size) / 2 });
  strokes.push(...l.strokes);
  return { strokes, missing: l.missing };
}

export const LABEL_NODES: NodeDef[] = [
  {
    type: "snowflake",
    label: "Snowflake",
    description: "A procedural six-fold snowflake. Every seed grows a different one.",
    inputs: [],
    outputs: [{ name: "lines", type: "lines" }],
    params: {
      seed: { kind: "number", label: "Seed", default: 1, min: 1, max: 9999, step: 1 },
      branches: { kind: "number", label: "Branches per arm", default: 3, min: 0, max: 6, step: 1 },
      detail: { kind: "number", label: "Detail", default: 2, min: 1, max: 2, step: 1 },
    },
    compute: (_, p) => ({ lines: framed(snowflake({ seed: p.seed as number, branches: p.branches as number, detail: p.detail as number })) satisfies Lines }),
  },
  {
    type: "cookieLabels",
    label: "Cookie labels",
    description:
      "A sheet of stackable gift labels, one per name: the top-left corner cut off, a string hole there, the name, and a different snowflake on each.",
    inputs: [],
    outputs: [{ name: "drawing", type: "drawing" }],
    params: {
      names: { kind: "text", label: "Names (one per line)", default: "Anna\nBen\nClara\nDavid", multiline: true },
      font: { kind: "font", label: "Font", default: DEFAULT_FONT },
      textSize: { kind: "number", label: "Name size", default: 8, min: 2, max: 30, step: 0.5, unit: "mm (shrinks to fit)" },
      width: { kind: "number", label: "Label width", default: 70, min: 20, max: 200, step: 1, unit: "mm" },
      height: { kind: "number", label: "Label height", default: 32, min: 10, max: 200, step: 1, unit: "mm" },
      chamfer: { kind: "number", label: "Cut corner", default: 10, min: 0, max: 50, step: 0.5, unit: "mm" },
      hole: { kind: "boolean", label: "String hole", default: true },
      holeRadius: { kind: "number", label: "Hole radius", default: 2, min: 0.5, max: 8, step: 0.1, unit: "mm" },
      snowflake: { kind: "boolean", label: "Snowflake", default: true },
      flakeSize: { kind: "number", label: "Snowflake size", default: 24, min: 5, max: 100, step: 0.5, unit: "mm" },
      seed: { kind: "number", label: "Snowflake seed", default: 1, min: 1, max: 9999, step: 1 },
      outline: { kind: "boolean", label: "Cut outline", default: true },
      gap: { kind: "number", label: "Gap between labels", default: 3, min: 0, max: 30, step: 0.5, unit: "mm" },
      margin: { kind: "number", label: "Sheet margin", default: 4, min: 0, max: 30, step: 0.5, unit: "mm" },
      ...SHEET_PARAMS,
    },
    compute(_, p, ctx) {
      const font = fontOf(ctx, p.font);
      const sheet = paperSize({ size: p.paper, orientation: p.orientation });
      const o = p as unknown as LabelOptions & { gap: number; margin: number; names: string };
      const names = String(p.names)
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean);
      const cols = Math.max(0, Math.floor((sheet.width - 2 * o.margin + o.gap) / (o.width + o.gap)));
      const rows = Math.max(0, Math.floor((sheet.height - 2 * o.margin + o.gap) / (o.height + o.gap)));
      const strokes: Stroke[] = [];
      const missing = new Set<string>();
      const fit = Math.min(names.length, cols * rows);
      for (let i = 0; i < fit; i++) {
        const x = o.margin + (i % cols) * (o.width + o.gap);
        const y = o.margin + Math.floor(i / cols) * (o.height + o.gap);
        const label = labelStrokes(names[i], i, o, font);
        strokes.push(...label.strokes.map((s) => s.map((q) => ({ x: q.x + x, y: q.y + y }))));
        label.missing.forEach((m) => missing.add(m));
      }
      const notes = [
        ...(names.length > fit ? [`${names.length - fit} of ${names.length} names do not fit on this sheet (${cols * rows} labels)`] : []),
        ...(missing.size ? [`font lacks ${[...missing].join(" ")}`] : []),
      ];
      return { drawing: { paper: sheet, strokes, notes } satisfies PaperDrawing };
    },
    summary: (out) => {
      const d = out.drawing as PaperDrawing;
      return [`${d.strokes.length} strokes`, ...(d.notes ?? [])].join(" · ");
    },
  },
];
