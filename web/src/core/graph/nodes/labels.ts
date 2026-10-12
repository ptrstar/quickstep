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
  /** How far both left corners are cut back (mm); half the height makes a triangle point. */
  chamfer: number;
  hole: boolean;
  holeRadius: number;
  textSize: number;
  outline: boolean;
};

/**
 * Outline of one label at (0, 0), its pointed end on the left (or on the right when mirrored):
 * both corners at that end cut off at 45°, a trapezoid, or a triangle at chamfer = height / 2.
 */
export function labelOutline(w: number, h: number, c: number, mirrored = false): Stroke {
  const k = Math.max(0, Math.min(c, h / 2, w));
  const pts: Point[] = [
    { x: k, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: k, y: h },
    { x: 0, y: h - k },
    ...(h - k > k ? [{ x: 0, y: k }] : []),
    { x: k, y: 0 },
  ];
  return mirrored ? pts.map((p) => ({ x: w - p.x, y: p.y })) : pts;
}

/** One label: outline, a string hole in the pointed end, and the name, which always reads left to right. */
export function labelStrokes(name: string, o: LabelOptions, font: Font, mirrored = false): { strokes: Stroke[]; missing: string[] } {
  const strokes: Stroke[] = [];
  if (o.outline) strokes.push(labelOutline(o.width, o.height, o.chamfer, mirrored));
  const flip = (x: number) => (mirrored ? o.width - x : x);

  // hole on the centre line of the pointed end, where the label is wide enough for it
  const hx = Math.max(0.6 * o.chamfer, o.holeRadius + 3);
  if (o.hole) strokes.push(ellipse(flip(hx), o.height / 2, o.holeRadius, o.holeRadius));

  // name between the pointed end (or the hole) and the square end, shrunk to fit, centred
  const pointSide = o.hole ? hx + o.holeRadius + 2.5 : Math.max(3, 0.6 * o.chamfer);
  const left = mirrored ? 3 : pointSide;
  const right = mirrored ? o.width - pointSide : o.width - 3;
  const box = Math.max(1, right - left);
  let size = o.textSize;
  const natural = layoutText(name, font, { size, lineHeight: 1.2, align: "left", width: 0 }).width;
  if (natural > box) size *= box / natural;
  const l = layoutText(name, font, { size, lineHeight: 1.2, align: "center", width: box }, { x: left, y: o.height / 2 - ((font.ascent + font.descent) * size) / 2 });
  strokes.push(...l.strokes);
  return { strokes, missing: l.missing };
}

// ---- distances, to nest labels as closely as the gap allows ----

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0; // they cross
  const toSeg = (p: Point, s: Point, e: Point) => {
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / l2)) : 0;
    return Math.hypot(p.x - s.x - t * dx, p.y - s.y - t * dy);
  };
  return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b));
}

/** Smallest distance between two outlines (0 when they cross). */
export function outlineDistance(p: Stroke, q: Stroke): number {
  let best = Infinity;
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) best = Math.min(best, segmentDistance(p[i - 1], p[i], q[j - 1], q[j]));
  return best;
}

const shift = (s: Stroke, dx: number, dy: number) => s.map((p) => ({ x: p.x + dx, y: p.y + dy }));

export type Placement = { x: number; y: number; mirrored: boolean };

/**
 * Where labels go on the sheet. "grid": rows and columns, all pointing left. "nested": columns in
 * pairs, the left one pointing right and shifted half a label down, so its points slide into the
 * notches between the labels of the right one, as far as the gap allows.
 */
export function placeLabels(o: { width: number; height: number; chamfer: number; gap: number; margin: number; layout: "grid" | "nested" | "best" }, sheet: { width: number; height: number }): Placement[] {
  if (o.layout === "best") {
    // nesting saves width but its shifted columns can lose a label at the bottom: keep the better one
    const nested = placeLabels({ ...o, layout: "nested" }, sheet);
    const grid = placeLabels({ ...o, layout: "grid" }, sheet);
    return nested.length >= grid.length ? nested : grid;
  }
  const { width: w, height: h, gap, margin: m } = o;
  const pitch = h + gap;
  const fits = (x: number, y: number) => x >= m - 1e-9 && y >= m - 1e-9 && x + w <= sheet.width - m + 1e-9 && y + h <= sheet.height - m + 1e-9;
  const column = (x: number, y0: number, mirrored: boolean) => {
    const out: Placement[] = [];
    for (let y = y0; y + h <= sheet.height - m + 1e-9; y += pitch) if (fits(x, y)) out.push({ x, y, mirrored });
    return out;
  };

  if (o.layout === "grid") {
    const out: Placement[] = [];
    for (let x = m; x + w <= sheet.width - m + 1e-9; x += w + gap) out.push(...column(x, m, false));
    return out;
  }

  // overlap of a pair: the most the right-pointing column can slide into the left-pointing one
  const a0 = labelOutline(w, h, o.chamfer, false);
  const b = labelOutline(w, h, o.chamfer, true);
  const clear = (overlap: number) => {
    const bx = -w + overlap; // B left of A (A at x = 0)
    const bb = shift(b, bx, pitch / 2);
    return outlineDistance(bb, a0) >= gap - 1e-6 && outlineDistance(bb, shift(a0, 0, pitch)) >= gap - 1e-6;
  };
  let lo = -gap;
  let hi = w;
  if (!clear(lo)) lo = -gap;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid;
    else hi = mid;
  }
  const overlap = lo;

  const out: Placement[] = [];
  for (let x = m; x + w <= sheet.width - m + 1e-9; ) {
    out.push(...column(x, m + pitch / 2, true)); // pointing right, half a label down
    const ax = x + w - overlap;
    if (ax + w > sheet.width - m + 1e-9) break;
    out.push(...column(ax, m, false)); // pointing left
    x = ax + w + gap;
  }
  return out;
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
      "A sheet of gift labels, one per name: the left end cut to a point or trapezoid with a string hole, the name on the rest. Nested pairs of columns interlock their points to save space.",
    inputs: [],
    outputs: [{ name: "drawing", type: "drawing" }],
    params: {
      names: { kind: "text", label: "Names (one per line)", default: "Anna\nBen\nClara\nDavid\nEmil\nFrida", multiline: true },
      font: { kind: "font", label: "Font", default: DEFAULT_FONT },
      textSize: { kind: "number", label: "Name size", default: 8, min: 2, max: 30, step: 0.5, unit: "mm (shrinks to fit)" },
      width: { kind: "number", label: "Label width", default: 60, min: 20, max: 200, step: 1, unit: "mm" },
      height: { kind: "number", label: "Label height", default: 28, min: 10, max: 200, step: 1, unit: "mm" },
      chamfer: { kind: "number", label: "Point depth", default: 14, min: 0, max: 100, step: 0.5, unit: "mm (½ height = triangle)" },
      hole: { kind: "boolean", label: "String hole", default: true },
      holeRadius: { kind: "number", label: "Hole radius", default: 2, min: 0.5, max: 8, step: 0.1, unit: "mm" },
      outline: { kind: "boolean", label: "Cut outline", default: true },
      layout: {
        kind: "select",
        label: "Layout",
        default: "best",
        options: [
          { value: "best", label: "best fit (whichever holds more)" },
          { value: "nested", label: "nested pairs (points interlock)" },
          { value: "grid", label: "grid" },
        ],
      },
      gap: { kind: "number", label: "Gap between labels", default: 3, min: 0, max: 30, step: 0.5, unit: "mm" },
      margin: { kind: "number", label: "Sheet margin", default: 4, min: 0, max: 30, step: 0.5, unit: "mm" },
      ...SHEET_PARAMS,
    },
    compute(_, p, ctx) {
      const font = fontOf(ctx, p.font);
      const sheet = paperSize({ size: p.paper, orientation: p.orientation });
      const o = p as unknown as LabelOptions & { gap: number; margin: number; layout: "grid" | "nested" | "best" };
      const names = String(p.names)
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean);
      const spots = placeLabels(o, sheet);
      const strokes: Stroke[] = [];
      const missing = new Set<string>();
      const fit = Math.min(names.length, spots.length);
      for (let i = 0; i < fit; i++) {
        const { x, y, mirrored } = spots[i];
        const label = labelStrokes(names[i], o, font, mirrored);
        strokes.push(...label.strokes.map((s) => shift(s, x, y)));
        label.missing.forEach((m) => missing.add(m));
      }
      const notes = [
        ...(names.length > fit ? [`${names.length - fit} of ${names.length} names do not fit on this sheet (${spots.length} labels)`] : []),
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
