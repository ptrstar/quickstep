import type { Point, Stroke } from "../geometry";
import type { Font } from "../text/font";

/** What flows along a wire. Ports only connect to ports of the same type. */
export type DataType = "image" | "gray" | "lines" | "drawing";

/** Colour pixels, RGBA 0…255, row-major. */
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

/** One channel, 0 = black … 1 = white, row-major. */
export type GrayImage = { width: number; height: number; data: Float32Array };

/**
 * Marks to draw around one-point strokes, sized in mm on paper. Image nodes cannot know millimetres
 * (only the Paper node decides how big the picture becomes), so they describe the marks and the
 * Paper node draws them at their true size.
 */
export type Marks = {
  /** circle, or a regular polygon with `corners` corners */
  shape: "circle" | "polygon";
  corners: number;
  /** degrees */
  rotation: number;
  /** mm */
  minRadius: number;
  maxRadius: number;
  /** Per stroke, 0…1: where between min and max radius (strokes with more than one point ignore it). */
  sizes: number[];
};

/** Pen paths in frame units (an image's pixels), inside a width × height frame. */
export type Lines = { width: number; height: number; strokes: Stroke[]; marks?: Marks };

/** Pen paths in mm on a sheet of paper; (0, 0) is the paper's top-left corner. */
export type PaperDrawing = {
  paper: { width: number; height: number };
  strokes: Stroke[];
  /** Warnings worth showing, e.g. characters a font does not have. */
  notes?: string[];
};

export type DataValue = {
  image: RgbaImage;
  gray: GrayImage;
  lines: Lines;
  drawing: PaperDrawing;
};

export type Value = DataValue[DataType];

export type Port = { name: string; type: DataType };

/** Show a control only while another select param has one of the given values. */
export type ParamCondition = { param: string; is: string | string[] };

export type ParamSpec =
  | { kind: "number"; label: string; default: number; min: number; max: number; step: number; unit?: string; when?: ParamCondition }
  | { kind: "select"; label: string; default: string; options: { value: string; label: string }[] }
  | { kind: "boolean"; label: string; default: boolean }
  | { kind: "text"; label: string; default: string; multiline?: boolean }
  /** Reference to an image the user loaded. Not stored in presets' assets, only its key. */
  | { kind: "asset"; label: string; default: string }
  /** A built-in font key, or the key of a font file the user loaded. */
  | { kind: "font"; label: string; default: string };

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

/** Images loaded by the user, by key. Kept outside the graph so presets stay small. */
export type Assets = ReadonlyMap<string, RgbaImage>;

export type ComputeContext = { assets: Assets; fonts?: ReadonlyMap<string, Font> };

export type NodeDef = {
  type: string;
  label: string;
  description: string;
  inputs: Port[];
  outputs: Port[];
  params: Record<string, ParamSpec>;
  /**
   * Pure: same inputs and params give the same outputs. Inputs are present for every input port
   * (the engine does not call compute otherwise). Throw to report a problem with the inputs.
   */
  compute(inputs: Record<string, Value>, params: Params, ctx: ComputeContext): Record<string, Value>;
  /** Not offered in the add-node menu (the output knob). */
  hidden?: boolean;
  /** One line for the node card, from its outputs (and inputs, e.g. to show before → after). */
  summary?(outputs: Record<string, Value>, params: Params, inputs: Record<string, Value>): string;
};

export type { Point, Stroke };

/** Thrown by compute when something is missing that the user still has to provide (e.g. an image). */
export class NeedsInput extends Error {}
