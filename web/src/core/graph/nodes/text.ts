import type { Stroke } from "../../geometry";
import { DEFAULT_FONT } from "../../text/builtin";
import type { Font } from "../../text/font";
import { layoutText } from "../../text/layout";
import type { ComputeContext, NodeDef, PaperDrawing, Params } from "../types";
import { NeedsInput } from "../types";
import { PAPER_SIZES, paperSize } from "./paper";

function fontOf(ctx: ComputeContext, key: unknown): Font {
  const font = ctx.fonts?.get(String(key));
  if (!font) throw new NeedsInput("loading font");
  return font;
}

const missingNote = (missing: string[]) => (missing.length ? [`font lacks ${missing.join(" ")}`] : []);

const alignOptions = [
  { value: "left", label: "left" },
  { value: "center", label: "centre" },
  { value: "right", label: "right" },
];

const sheetOptions = Object.entries(PAPER_SIZES)
  .filter(([key]) => key !== "custom")
  .map(([value, s]) => ({ value, label: s.label }));

export const textNode: NodeDef = {
  type: "text",
  label: "Text",
  description: "A text box on the paper, in a single-line or outline font. Merge it with other drawings.",
  inputs: [],
  outputs: [{ name: "drawing", type: "drawing" }],
  params: {
    text: { kind: "text", label: "Text", default: "Hello from QuickStep", multiline: true },
    font: { kind: "font", label: "Font", default: DEFAULT_FONT },
    textSize: { kind: "number", label: "Size", default: 6, min: 1, max: 80, step: 0.5, unit: "mm" },
    lineHeight: { kind: "number", label: "Line spacing", default: 1.3, min: 0.8, max: 3, step: 0.05, unit: "× size" },
    align: { kind: "select", label: "Align", default: "left", options: alignOptions },
    x: { kind: "number", label: "Left", default: 10, min: 0, max: 500, step: 0.5, unit: "mm" },
    y: { kind: "number", label: "Top", default: 10, min: 0, max: 500, step: 0.5, unit: "mm" },
    width: { kind: "number", label: "Box width", default: 85, min: 0, max: 500, step: 1, unit: "mm (0 = no wrap)" },
    paper: { kind: "select", label: "Paper", default: "a6", options: sheetOptions },
    orientation: {
      kind: "select",
      label: "Orientation",
      default: "portrait",
      options: [
        { value: "portrait", label: "portrait" },
        { value: "landscape", label: "landscape" },
      ],
    },
  },
  compute(_, p, ctx) {
    const font = fontOf(ctx, p.font);
    const l = layoutText(String(p.text), font, { size: p.textSize as number, lineHeight: p.lineHeight as number, align: p.align as "left", width: p.width as number }, { x: p.x as number, y: p.y as number });
    const drawing: PaperDrawing = { paper: paperSize({ size: p.paper, orientation: p.orientation }), strokes: l.strokes, notes: missingNote(l.missing) };
    return { drawing };
  },
  summary: (out) => {
    const d = out.drawing as PaperDrawing;
    return [`${d.strokes.length} strokes`, ...(d.notes ?? [])].join(" · ");
  },
};

/** Postcard back, A6 landscape (148 × 105 mm): message left, divider, stamp box, address right. */
export const POSTCARD = {
  paper: { width: 148, height: 105 },
  message: { x: 9, y: 12, width: 60 },
  divider: { x: 74, top: 10, bottom: 95 },
  stamp: { x: 118, y: 8, width: 22, height: 26 },
  address: { x: 80, right: 140, baselines: [56, 67, 78, 89] },
};

function rect(x: number, y: number, w: number, h: number): Stroke {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ];
}

export function postcardStrokes(p: Params, font: Font): PaperDrawing {
  const L = POSTCARD;
  const strokes: Stroke[] = [];
  const message = layoutText(
    String(p.message),
    font,
    { size: p.textSize as number, lineHeight: p.lineHeight as number, align: "left", width: L.message.width },
    { x: L.message.x, y: L.message.y },
  );
  strokes.push(...message.strokes);

  const missing = new Set(message.missing);
  const addressSize = p.addressSize as number;
  const lines = String(p.address).split(/\r?\n/);
  lines.forEach((line, i) => {
    // beyond the printed lines, keep the same spacing
    const step = L.address.baselines[1] - L.address.baselines[0];
    const baseline = L.address.baselines[i] ?? L.address.baselines[L.address.baselines.length - 1] + (i - L.address.baselines.length + 1) * step;
    const l = layoutText(line, font, { size: addressSize, lineHeight: 1, align: "left", width: 0 }, { x: L.address.x + 1, y: baseline - 1.2 - font.ascent * addressSize });
    strokes.push(...l.strokes);
    l.missing.forEach((m) => missing.add(m));
  });

  if (p.divider) strokes.push([{ x: L.divider.x, y: L.divider.top }, { x: L.divider.x, y: L.divider.bottom }]);
  if (p.stamp) strokes.push(rect(L.stamp.x, L.stamp.y, L.stamp.width, L.stamp.height));
  if (p.addressLines) for (const y of L.address.baselines) strokes.push([{ x: L.address.x, y }, { x: L.address.right, y }]);
  return { paper: L.paper, strokes, notes: missingNote([...missing]) };
}

export const postcardNode: NodeDef = {
  type: "postcard",
  label: "Postcard back",
  description: "The back of an A6 postcard: your message on the left, address lines and a stamp box on the right.",
  inputs: [],
  outputs: [{ name: "drawing", type: "drawing" }],
  params: {
    message: { kind: "text", label: "Message", default: "Greetings from the plotter!", multiline: true },
    address: { kind: "text", label: "Address", default: "Name\nStreet 1\n8000 Town\nCountry", multiline: true },
    font: { kind: "font", label: "Font", default: DEFAULT_FONT },
    textSize: { kind: "number", label: "Message size", default: 4.5, min: 2, max: 12, step: 0.1, unit: "mm" },
    lineHeight: { kind: "number", label: "Line spacing", default: 1.45, min: 1, max: 3, step: 0.05, unit: "× size" },
    addressSize: { kind: "number", label: "Address size", default: 5, min: 2, max: 10, step: 0.1, unit: "mm" },
    divider: { kind: "boolean", label: "Divider", default: true },
    stamp: { kind: "boolean", label: "Stamp box", default: true },
    addressLines: { kind: "boolean", label: "Address lines", default: true },
  },
  compute: (_, p, ctx) => ({ drawing: postcardStrokes(p, fontOf(ctx, p.font)) }),
  summary: (out) => {
    const d = out.drawing as PaperDrawing;
    return [`${d.strokes.length} strokes`, ...(d.notes ?? [])].join(" · ");
  },
};

export const mergeNode: NodeDef = {
  type: "merge",
  label: "Merge",
  description: "Puts two drawings on one sheet: all strokes of A, then all of B. The sheet is A's.",
  inputs: [
    { name: "a", type: "drawing" },
    { name: "b", type: "drawing" },
  ],
  outputs: [{ name: "drawing", type: "drawing" }],
  params: {},
  compute(inp) {
    const a = inp.a as PaperDrawing;
    const b = inp.b as PaperDrawing;
    const differ = a.paper.width !== b.paper.width || a.paper.height !== b.paper.height;
    const notes = [...(a.notes ?? []), ...(b.notes ?? []), ...(differ ? [`sheets differ, using A's ${a.paper.width} × ${a.paper.height}`] : [])];
    return { drawing: { paper: a.paper, strokes: [...a.strokes, ...b.strokes], notes } satisfies PaperDrawing };
  },
  summary: (out, _, inp) => {
    const d = out.drawing as PaperDrawing;
    const n = (k: string) => (inp[k] as PaperDrawing).strokes.length;
    return [`${n("a")} + ${n("b")} strokes`, ...(d.notes ?? [])].join(" · ");
  },
};
