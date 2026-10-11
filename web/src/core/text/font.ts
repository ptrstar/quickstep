import type { Stroke } from "../geometry";
import { pathToPolylines } from "./svgpath";

/**
 * A glyph's pen strokes in em units (1 = the font's em), x to the right, y DOWN from the baseline
 * (so letters sit at negative y). Single-line fonts give open strokes; outline fonts give closed
 * contours, drawn as their outline.
 */
export type Glyph = { advance: number; strokes: Stroke[] };

export interface Font {
  name: string;
  kind: "single-line" | "outline";
  /** Height above / below the baseline, in em. */
  ascent: number;
  descent: number;
  glyph(ch: string): Glyph | undefined;
  /** Extra advance between two characters, in em (usually ≤ 0). */
  kerning(a: string, b: string): number;
}

/** Curves are flattened to this fraction of an em (≈ 0.01 mm at 5 mm text). */
const CURVE_TOLERANCE = 0.002;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = m[2] ?? m[3];
  return out;
}

/** Parses an SVG font (<font>, <font-face>, <glyph> elements), e.g. the EMS single-line fonts. */
export function parseSvgFont(svg: string, kind: Font["kind"] = "single-line"): Font {
  const fontTag = svg.match(/<font\b[^>]*>/)?.[0];
  const faceTag = svg.match(/<font-face\b[^>]*>/)?.[0];
  if (!fontTag || !faceTag) throw new Error("not an SVG font (no <font> / <font-face>)");
  const font = attrs(fontTag);
  const face = attrs(faceTag);
  const em = Number(face["units-per-em"]) || 1000;
  const defaultAdvance = Number(font["horiz-adv-x"]) || em / 2;

  const glyphs = new Map<string, Glyph>();
  for (const m of svg.matchAll(/<glyph\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.unicode === undefined) continue;
    const ch = decodeEntities(a.unicode);
    const strokes = a.d ? pathToPolylines(a.d, CURVE_TOLERANCE * em).map((s) => s.map((p) => ({ x: p.x / em, y: -p.y / em }))) : [];
    glyphs.set(ch, { advance: (Number(a["horiz-adv-x"]) || defaultAdvance) / em, strokes });
  }
  const kerns = new Map<string, number>();
  for (const m of svg.matchAll(/<hkern\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.u1 && a.u2 && a.k) kerns.set(decodeEntities(a.u1) + "\u0000" + decodeEntities(a.u2), -Number(a.k) / em);
  }
  return {
    name: face["font-family"] ?? font.id ?? "SVG font",
    kind,
    ascent: (Number(face.ascent) || em * 0.8) / em,
    descent: Math.abs(Number(face.descent) || em * 0.2) / em,
    glyph: (ch) => glyphs.get(ch),
    kerning: (a, b) => kerns.get(a + "\u0000" + b) ?? 0,
  };
}

/** The bits of an opentype.js Font this module uses (keeps opentype out of the core's types). */
export type OpenTypeLike = {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  names: { fontFamily?: Record<string, string> };
  charToGlyph(ch: string): { index: number; advanceWidth?: number; getPath(x: number, y: number, size: number): { commands: PathCommand[] } };
  getKerningValue(a: unknown, b: unknown): number;
};

export type PathCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Q"; x1: number; y1: number; x: number; y: number }
  | { type: "Z" };

/**
 * Outline contours as closed strokes. Contours are closed explicitly, since CFF-based fonts leave
 * the closing implicit (no Z), and opentype.js's toPathData() then even drops the last point.
 */
export function outlineStrokes(commands: PathCommand[]): Stroke[] {
  const d = commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${c.x} ${c.y}`;
        case "C":
          return `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
        case "Q":
          return `Q${c.x1} ${c.y1} ${c.x} ${c.y}`;
        default:
          return "Z";
      }
    })
    .join(" ");
  return pathToPolylines(d, CURVE_TOLERANCE).map((s) => {
    const a = s[0];
    const b = s[s.length - 1];
    return a.x === b.x && a.y === b.y ? s : [...s, a];
  });
}

/** Adapts a parsed TTF / OTF / WOFF font: glyph outlines become closed strokes. */
export function fromOpenType(ot: OpenTypeLike): Font {
  const em = ot.unitsPerEm;
  const cache = new Map<string, Glyph | undefined>();
  return {
    name: Object.values(ot.names.fontFamily ?? {})[0] ?? "Font",
    kind: "outline",
    ascent: ot.ascender / em,
    descent: Math.abs(ot.descender) / em,
    glyph(ch) {
      if (!cache.has(ch)) {
        const g = ot.charToGlyph(ch);
        if (!g || g.index === 0) cache.set(ch, undefined);
        else {
          // getPath at size 1 is already in em units with y down
          cache.set(ch, { advance: (g.advanceWidth ?? 0) / em, strokes: outlineStrokes(g.getPath(0, 0, 1).commands) });
        }
      }
      return cache.get(ch);
    },
    kerning(a, b) {
      const ga = ot.charToGlyph(a);
      const gb = ot.charToGlyph(b);
      return ga && gb ? ot.getKerningValue(ga, gb) / em : 0;
    },
  };
}
