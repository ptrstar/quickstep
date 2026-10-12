import type { Point, Stroke } from "../../geometry";
import type { NodeDef, PaperDrawing } from "../types";
import { PAPER_SIZES, paperSize } from "./paper";

const ARC_STEP = 0.25; // mm per segment on curves

/** Closed rounded rectangle (radius 0 = sharp corners) with its top-left corner at (x, y). */
export function roundedRect(x: number, y: number, w: number, h: number, r: number): Stroke {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y },
    ];
  }
  const n = Math.max(3, Math.ceil((Math.PI * rr) / 2 / ARC_STEP));
  const corners = [
    { cx: x + w - rr, cy: y + rr, a0: -Math.PI / 2 },
    { cx: x + w - rr, cy: y + h - rr, a0: 0 },
    { cx: x + rr, cy: y + h - rr, a0: Math.PI / 2 },
    { cx: x + rr, cy: y + rr, a0: Math.PI },
  ];
  const pts: Stroke = [];
  for (const c of corners) {
    for (let k = 0; k <= n; k++) {
      const a = c.a0 + (k / n) * (Math.PI / 2);
      pts.push({ x: c.cx + rr * Math.cos(a), y: c.cy + rr * Math.sin(a) });
    }
  }
  pts.push(pts[0]);
  return pts;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): Stroke {
  const n = Math.max(24, Math.ceil((Math.PI * (rx + ry)) / ARC_STEP));
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

/** Regular polygon inscribed in the box (x, y, w, h), first corner at the top. */
export function boxPolygon(x: number, y: number, w: number, h: number, corners: number): Stroke {
  const n = Math.max(3, Math.round(corners));
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * (k % n)) / n;
    return { x: x + w / 2 + (w / 2) * Math.cos(a), y: y + h / 2 + (h / 2) * Math.sin(a) };
  });
}

export function rotateAround(strokes: Stroke[], c: Point, degrees: number): Stroke[] {
  if (!degrees) return strokes;
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return strokes.map((s) => s.map((p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos })));
}

export type ShapeOptions = {
  shape: "rectangle" | "rounded" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  corners: number;
  rotation: number;
  /** Concentric copies, each `spacing` mm further inside. */
  copies: number;
  spacing: number;
};

/** A shape in mm (e.g. a frame), with optional copies inset by `spacing`. */
export function shapeStrokes(o: ShapeOptions): Stroke[] {
  const strokes: Stroke[] = [];
  for (let k = 0; k < o.copies; k++) {
    const inset = k * o.spacing;
    const w = o.width - 2 * inset;
    const h = o.height - 2 * inset;
    if (w <= 0 || h <= 0) break;
    const x = o.x + inset;
    const y = o.y + inset;
    if (o.shape === "ellipse") strokes.push(ellipse(x + w / 2, y + h / 2, w / 2, h / 2));
    else if (o.shape === "polygon") strokes.push(boxPolygon(x, y, w, h, o.corners));
    else strokes.push(roundedRect(x, y, w, h, o.shape === "rounded" ? Math.max(0, o.radius - inset) : 0));
  }
  return rotateAround(strokes, { x: o.x + o.width / 2, y: o.y + o.height / 2 }, o.rotation);
}

export type TransformOptions = { dx: number; dy: number; scale: number; rotate: number; mirror: "none" | "horizontal" | "vertical" };

/** Mirrors, scales and rotates a drawing around its own centre, then moves it (mm). */
export function transformStrokes(strokes: Stroke[], o: TransformOptions): Stroke[] {
  const pts = strokes.flat();
  if (pts.length === 0) return strokes;
  const c = {
    x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2,
    y: (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2,
  };
  const a = (o.rotate * Math.PI) / 180;
  const cos = Math.cos(a) * o.scale;
  const sin = Math.sin(a) * o.scale;
  const mx = o.mirror === "horizontal" ? -1 : 1;
  const my = o.mirror === "vertical" ? -1 : 1;
  return strokes.map((s) =>
    s.map((p) => {
      const x = (p.x - c.x) * mx;
      const y = (p.y - c.y) * my;
      return { x: c.x + x * cos - y * sin + o.dx, y: c.y + x * sin + y * cos + o.dy };
    }),
  );
}

export const SHEET_PARAMS: NodeDef["params"] = {
  paper: {
    kind: "select",
    label: "Paper",
    default: "a6",
    options: Object.entries(PAPER_SIZES)
      .filter(([key]) => key !== "custom")
      .map(([value, s]) => ({ value, label: s.label })),
  },
  orientation: {
    kind: "select",
    label: "Orientation",
    default: "portrait",
    options: [
      { value: "portrait", label: "portrait" },
      { value: "landscape", label: "landscape" },
    ],
  },
};

export const SHAPE_NODES: NodeDef[] = [
  {
    type: "shape",
    label: "Shape",
    description: "A rectangle, rounded rectangle, ellipse or polygon in mm on the sheet, e.g. a frame. Copies add lines further inside.",
    inputs: [],
    outputs: [{ name: "drawing", type: "drawing" }],
    params: {
      shape: {
        kind: "select",
        label: "Shape",
        default: "rectangle",
        options: [
          { value: "rectangle", label: "rectangle" },
          { value: "rounded", label: "rounded rectangle" },
          { value: "ellipse", label: "ellipse" },
          { value: "polygon", label: "polygon" },
        ],
      },
      x: { kind: "number", label: "Left", default: 5, min: 0, max: 500, step: 0.5, unit: "mm" },
      y: { kind: "number", label: "Top", default: 5, min: 0, max: 500, step: 0.5, unit: "mm" },
      width: { kind: "number", label: "Width", default: 95, min: 1, max: 500, step: 0.5, unit: "mm" },
      height: { kind: "number", label: "Height", default: 138, min: 1, max: 500, step: 0.5, unit: "mm" },
      radius: { kind: "number", label: "Corner radius", default: 6, min: 0, max: 100, step: 0.5, unit: "mm", when: { param: "shape", is: "rounded" } },
      corners: { kind: "number", label: "Corners", default: 6, min: 3, max: 24, step: 1, when: { param: "shape", is: "polygon" } },
      rotation: { kind: "number", label: "Rotation", default: 0, min: -180, max: 180, step: 1, unit: "°" },
      copies: { kind: "number", label: "Lines", default: 1, min: 1, max: 50, step: 1 },
      spacing: { kind: "number", label: "Line spacing", default: 1.5, min: 0.2, max: 20, step: 0.1, unit: "mm" },
      ...SHEET_PARAMS,
    },
    compute: (_, p) => ({
      drawing: {
        paper: paperSize({ size: p.paper, orientation: p.orientation }),
        strokes: shapeStrokes(p as unknown as ShapeOptions),
      } satisfies PaperDrawing,
    }),
  },
  {
    type: "transform",
    label: "Transform",
    description: "Moves, scales, rotates or mirrors a whole drawing (around its own centre), in mm on the sheet.",
    inputs: [{ name: "drawing", type: "drawing" }],
    outputs: [{ name: "drawing", type: "drawing" }],
    params: {
      dx: { kind: "number", label: "Move right", default: 0, min: -500, max: 500, step: 0.5, unit: "mm" },
      dy: { kind: "number", label: "Move down", default: 0, min: -500, max: 500, step: 0.5, unit: "mm" },
      scale: { kind: "number", label: "Scale", default: 1, min: 0.05, max: 10, step: 0.01, unit: "×" },
      rotate: { kind: "number", label: "Rotate", default: 0, min: -180, max: 180, step: 0.5, unit: "°" },
      mirror: {
        kind: "select",
        label: "Mirror",
        default: "none",
        options: [
          { value: "none", label: "none" },
          { value: "horizontal", label: "left ↔ right" },
          { value: "vertical", label: "top ↔ bottom" },
        ],
      },
    },
    compute: (inp, p) => {
      const d = inp.drawing as PaperDrawing;
      return { drawing: { ...d, strokes: transformStrokes(d.strokes, p as unknown as TransformOptions) } satisfies PaperDrawing };
    },
  },
];
