import type { Point, Stroke } from "../geometry";
import type { Font } from "./font";

export type TextStyle = {
  /** Em size in mm. */
  size: number;
  /** Distance between baselines, × size. */
  lineHeight: number;
  align: "left" | "center" | "right";
  /** Wrap width in mm; 0 = only break at newlines. */
  width: number;
};

export type TextLayout = {
  strokes: Stroke[];
  /** Height of the laid-out block in mm (top of the first line to the bottom of the last). */
  height: number;
  /** Width of the widest line in mm. */
  width: number;
  /** Characters the font does not have (left as a gap). */
  missing: string[];
};

const MISSING_ADVANCE = 0.5; // em

/**
 * Lays out text in a box whose top-left corner is `origin` (mm). Words wrap at `width`; a word
 * longer than the width stays on its own line. Newlines always break.
 */
export function layoutText(text: string, font: Font, style: TextStyle, origin: Point = { x: 0, y: 0 }): TextLayout {
  const s = style.size;
  const missing = new Set<string>();
  const advance = (ch: string) => {
    const g = font.glyph(ch);
    if (!g && ch !== " ") missing.add(ch);
    return g?.advance ?? (ch === " " ? 0.3 : MISSING_ADVANCE);
  };
  const measure = (word: string) => {
    const chars = [...word];
    return chars.reduce((w, ch, i) => w + advance(ch) + (i > 0 ? font.kerning(chars[i - 1], ch) : 0), 0) * s;
  };

  // break into lines
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (style.width <= 0) {
      lines.push(paragraph);
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > style.width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

  const strokes: Stroke[] = [];
  let widest = 0;
  lines.forEach((line, n) => {
    const w = measure(line);
    widest = Math.max(widest, w);
    const box = style.width > 0 ? style.width : w;
    let x = origin.x + (style.align === "center" ? (box - w) / 2 : style.align === "right" ? box - w : 0);
    const baseline = origin.y + font.ascent * s + n * style.lineHeight * s;
    const chars = [...line];
    chars.forEach((ch, i) => {
      if (i > 0) x += font.kerning(chars[i - 1], ch) * s;
      const g = font.glyph(ch);
      if (g) for (const st of g.strokes) strokes.push(st.map((p) => ({ x: x + p.x * s, y: baseline + p.y * s })));
      x += advance(ch) * s;
    });
  });

  const height = lines.length ? (font.ascent + font.descent + (lines.length - 1) * style.lineHeight) * s : 0;
  return { strokes, height, width: widest, missing: [...missing] };
}
