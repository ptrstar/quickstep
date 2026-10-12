import type { Point, Stroke } from "../geometry";
import { flatten, smooth } from "../graph/nodes/optimize";
import { parseSvgFont } from "./font";

/**
 * A handwriting font being captured: strokes per character in font units (1000 per em), x to the
 * right, y UP from the baseline (as in SVG fonts). Exported as an SVG font like the EMS fonts.
 */
export type HandFont = {
  name: string;
  /** Space left and right of every glyph, font units. */
  spacing: number;
  glyphs: Record<string, Stroke[]>;
};

export const UNITS = 1000;
/** Guide lines, font units above the baseline (descender negative). */
export const METRICS = { ascent: 800, capHeight: 700, xHeight: 480, descent: -220 };

/** Characters to capture, in groups. Accented letters can be composed from a base and a mark. */
export const CHARSETS: { name: string; chars: string }[] = [
  { name: "Lowercase", chars: "abcdefghijklmnopqrstuvwxyz" },
  { name: "Uppercase", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { name: "Digits", chars: "0123456789" },
  { name: "Punctuation", chars: ".,;:!?'\"-–()&@/+*=#%€" },
  { name: "Accent marks", chars: "¨´`^" },
  { name: "Accented (optional, composed if empty)", chars: "äöüÄÖÜßéèàêçÉÈÀ" },
];

/** Accented letters built from a drawn base letter and a drawn mark, when not drawn themselves. */
const COMPOSE: Record<string, [string, string]> = {
  ä: ["a", "¨"], ö: ["o", "¨"], ü: ["u", "¨"], Ä: ["A", "¨"], Ö: ["O", "¨"], Ü: ["U", "¨"],
  é: ["e", "´"], è: ["e", "`"], à: ["a", "`"], ê: ["e", "^"], É: ["E", "´"], È: ["E", "`"], À: ["A", "`"],
  á: ["a", "´"], í: ["i", "´"], ó: ["o", "´"], ú: ["u", "´"], â: ["a", "^"], ô: ["o", "^"], î: ["i", "^"], û: ["u", "^"],
};

export const emptyHandFont = (name = "My handwriting"): HandFont => ({ name, spacing: 70, glyphs: {} });

/**
 * Cleans one captured stroke (font units): drops points closer than `minStep`, smooths a little and
 * straightens the bits that are straight anyway, so the font stays small and plots smoothly.
 */
export function cleanStroke(points: Stroke, minStep = 4): Stroke {
  if (points.length === 0) return points;
  const kept: Stroke = [points[0]];
  for (const p of points.slice(1)) if (Math.hypot(p.x - kept[kept.length - 1].x, p.y - kept[kept.length - 1].y) >= minStep) kept.push(p);
  if (kept.length === 1 && points.length > 1) kept.push(points[points.length - 1]);
  const round = (s: Stroke) => s.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  return round(flatten(smooth(kept, 1), 2, 15));
}

const bounds = (strokes: Stroke[]) => {
  const pts = strokes.flat();
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
};

const move = (strokes: Stroke[], dx: number, dy: number) => strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy })));

/** The glyphs to export: drawn ones, plus accented letters composed from base + mark. */
export function composedGlyphs(f: HandFont): Record<string, Stroke[]> {
  const out: Record<string, Stroke[]> = {};
  for (const [ch, s] of Object.entries(f.glyphs)) if (s.length) out[ch] = s;
  for (const [ch, [base, mark]] of Object.entries(COMPOSE)) {
    if (out[ch] || !out[base] || !out[mark]) continue;
    const b = bounds(out[base]);
    const m = bounds(out[mark]);
    // centre the mark over the base; marks are drawn at lowercase height, capitals lift them
    const lift = base === base.toUpperCase() ? METRICS.capHeight - METRICS.xHeight : 0;
    const dx = Math.round((b.minX + b.maxX) / 2 - (m.minX + m.maxX) / 2); // whole units, so files round-trip exactly
    out[ch] = [...out[base], ...move(out[mark], dx, lift)];
  }
  if (!out["ß"] && out.s) out["ß"] = [...out.s, ...move(out.s, bounds(out.s).maxX - bounds(out.s).minX + f.spacing, 0)];
  return out;
}

const escapeXml = (s: string) =>
  [...s].map((c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? (c.charCodeAt(0) > 126 ? `&#x${c.codePointAt(0)!.toString(16)};` : c)).join("");

/** Glyph advance and placement: each glyph is shifted so it starts `spacing` after the pen position. */
function placed(strokes: Stroke[], spacing: number): { strokes: Stroke[]; advance: number } {
  const b = bounds(strokes);
  return { strokes: move(strokes, spacing - b.minX, 0), advance: Math.round(b.maxX - b.minX + 2 * spacing) };
}

/** The font as an SVG font (same structure as the EMS single-line fonts). */
export function toSvgFont(f: HandFont): string {
  const id = f.name.replace(/[^\w]+/g, "") || "Handwriting";
  const lines = Object.entries(composedGlyphs(f))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ch, strokes]) => {
      const g = placed(strokes, f.spacing);
      const d = g.strokes.map((s) => s.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ")).join(" ");
      return `<glyph unicode="${escapeXml(ch)}" glyph-name="u${ch.codePointAt(0)!.toString(16)}" horiz-adv-x="${g.advance}" d="${d}" />`;
    });
  return [
    `<?xml version="1.0" encoding="UTF-8" ?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1">`,
    `<metadata>Font name: ${escapeXml(f.name)}. Single-line handwriting font made with QuickStep.</metadata>`,
    `<defs>`,
    `<font id="${id}" horiz-adv-x="${UNITS * 0.5}">`,
    `<font-face font-family="${escapeXml(f.name)}" units-per-em="${UNITS}" ascent="${METRICS.ascent}" descent="${METRICS.descent}" cap-height="${METRICS.capHeight}" x-height="${METRICS.xHeight}" />`,
    `<missing-glyph horiz-adv-x="${UNITS * 0.5}" />`,
    `<glyph unicode=" " glyph-name="space" horiz-adv-x="${UNITS * 0.3}" />`,
    ...lines,
    `</font>`,
    `</defs>`,
    `</svg>`,
  ].join("\n");
}

/** Reads an SVG font back into editable glyphs (e.g. to continue a font downloaded earlier). */
export function fromSvgFont(svg: string, name?: string): HandFont {
  const font = parseSvgFont(svg);
  const f = emptyHandFont(name ?? font.name);
  const chars = new Set<string>();
  for (const m of svg.matchAll(/<glyph\b[^>]*\bunicode="([^"]*)"/g)) chars.add(m[1]);
  for (const raw of chars) {
    const ch = raw.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()],
    );
    const g = font.glyph(ch);
    if (!g || g.strokes.length === 0) continue;
    f.glyphs[ch] = g.strokes.map((s) => s.map((p: Point) => ({ x: Math.round(p.x * UNITS), y: Math.round(-p.y * UNITS) })));
  }
  return f;
}

/** How much of a charset is drawn (composed accented letters count as done). */
export function progress(f: HandFont, chars: string): { done: number; total: number } {
  const have = composedGlyphs(f);
  const list = [...chars];
  return { done: list.filter((c) => have[c]?.length).length, total: list.length };
}
