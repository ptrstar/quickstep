import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { fromOpenType, type OpenTypeLike, parseSvgFont } from "./font";
import { layoutText } from "./layout";
import { pathToPolylines } from "./svgpath";

const ems = () => parseSvgFont(readFileSync(new URL("../../../public/fonts/EMSReadability.svg", import.meta.url), "utf8"));

describe("pathToPolylines", () => {
  it("reads absolute and relative lines, H/V, and starts a stroke per M", () => {
    expect(pathToPolylines("M0 0 L10 0 10 10 M5 5 l1 0 h2 v-3")).toEqual([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 2 }],
    ]);
  });

  it("closes subpaths with Z", () => {
    expect(pathToPolylines("M0 0 L4 0 L4 4 Z")).toEqual([[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 0 }]]);
  });

  it("flattens a cubic close to the true curve", () => {
    // quarter circle of radius 100 as a cubic (k = 0.5523)
    const [s] = pathToPolylines("M100 0 C100 55.23 55.23 100 0 100", 0.5);
    expect(s[0]).toEqual({ x: 100, y: 0 });
    expect(s.at(-1)).toEqual({ x: 0, y: 100 });
    for (const p of s) expect(Math.abs(Math.hypot(p.x, p.y) - 100)).toBeLessThan(0.1);
  });

  it("handles quadratics and smooth continuations", () => {
    const [s] = pathToPolylines("M0 0 Q5 10 10 0 T20 0");
    expect(s.at(-1)).toEqual({ x: 20, y: 0 });
    expect(Math.min(...s.map((p) => p.y))).toBeLessThan(-4); // T reflects the control point downwards
  });
});

describe("SVG single-line fonts", () => {
  it("reads EMS Readability with umlauts", () => {
    const f = ems();
    expect(f.name).toBe("EMS Readability");
    expect(f.kind).toBe("single-line");
    expect(f.ascent).toBeCloseTo(0.8);
    for (const ch of "Aaäöüß€") expect(f.glyph(ch)?.strokes.length, ch).toBeGreaterThan(0);
    // letters sit above the baseline: y is negative
    const a = f.glyph("A")!;
    expect(Math.min(...a.strokes.flat().map((p) => p.y))).toBeLessThan(-0.4);
    expect(f.glyph(" ")!.strokes).toEqual([]);
  });

  it("rejects files that are not SVG fonts", () => {
    expect(() => parseSvgFont("<svg><path d='M0 0'/></svg>")).toThrow(/not an SVG font/);
  });
});

describe("outline fonts", () => {
  it("draws glyph outlines as closed strokes, scaled to em", () => {
    const path = new opentype.Path();
    path.moveTo(100, 0);
    path.lineTo(300, 0);
    path.lineTo(300, 700);
    path.lineTo(100, 700);
    path.close();
    const glyphs = [
      new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
      new opentype.Glyph({ name: "I", unicode: 73, advanceWidth: 400, path }),
    ];
    const font = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
    const parsed = opentype.parse(font.toArrayBuffer());
    const f = fromOpenType(parsed as unknown as OpenTypeLike);
    expect(f.kind).toBe("outline");
    const g = f.glyph("I")!;
    expect(g.advance).toBeCloseTo(0.4);
    expect(g.strokes).toHaveLength(1);
    const s = g.strokes[0];
    expect(s[0]).toEqual(s.at(-1));
    const ys = s.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-0.7);
    expect(Math.max(...ys)).toBeCloseTo(0);
    expect(f.glyph("Q")).toBeUndefined();
  });
});

describe("layoutText", () => {
  const style = { size: 10, lineHeight: 1.3, align: "left" as const, width: 0 };

  it("places the first baseline at the ascent and advances per character", () => {
    const f = ems();
    const l = layoutText("II", f, style, { x: 5, y: 20 });
    const ys = l.strokes.flat().map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(20 + 8, 0); // baseline = top + ascent × size
    expect(l.width).toBeCloseTo(2 * f.glyph("I")!.advance * 10);
  });

  it("wraps words at the width and keeps newlines", () => {
    const f = ems();
    const one = layoutText("hello", f, style).width;
    const wrapped = layoutText("hello hello hello\nhi", f, { ...style, width: one * 2.2 });
    expect(wrapped.height).toBeCloseTo((0.8 + 0.2 + 2 * 1.3) * 10);
    expect(wrapped.width).toBeLessThanOrEqual(one * 2.2);
  });

  it("aligns lines inside the width", () => {
    const f = ems();
    const left = layoutText("x", f, { ...style, width: 100 });
    const right = layoutText("x", f, { ...style, width: 100, align: "right" });
    const minX = (l: typeof left) => Math.min(...l.strokes.flat().map((p) => p.x));
    expect(minX(right) - minX(left)).toBeCloseTo(100 - left.width);
  });

  it("reports characters the font lacks", () => {
    expect(layoutText("a☃b", ems(), style).missing).toEqual(["☃"]);
  });
});
