import { describe, expect, it } from "vitest";
import { parseSvgFont } from "./font";
import { cleanStroke, composedGlyphs, emptyHandFont, fromSvgFont, METRICS, progress, toSvgFont } from "./handwriting";
import { layoutText } from "./layout";

/** A hand-drawn-ish "l": a vertical stroke with jitter. */
const wobblyLine = () => Array.from({ length: 200 }, (_, i) => ({ x: 100 + Math.sin(i) * 1.5, y: i * 3.5 }));

function sample() {
  const f = emptyHandFont("Test Hand");
  f.glyphs.l = [cleanStroke(wobblyLine())];
  f.glyphs.o = [cleanStroke(Array.from({ length: 60 }, (_, i) => ({ x: 250 + 180 * Math.cos((i / 59) * 2 * Math.PI), y: 240 + 240 * Math.sin((i / 59) * 2 * Math.PI) })))];
  f.glyphs.O = [cleanStroke(Array.from({ length: 60 }, (_, i) => ({ x: 300 + 250 * Math.cos((i / 59) * 2 * Math.PI), y: 350 + 350 * Math.sin((i / 59) * 2 * Math.PI) })))];
  f.glyphs["¨"] = [
    [{ x: 0, y: 600 }, { x: 0, y: 630 }],
    [{ x: 120, y: 600 }, { x: 120, y: 630 }],
  ];
  return f;
}

describe("cleanStroke", () => {
  it("makes a jittery straight line a short, clean one with the same ends", () => {
    const raw = wobblyLine();
    const s = cleanStroke(raw);
    expect(s.length).toBeLessThan(10);
    expect(Math.abs(s[0].y - raw[0].y)).toBeLessThan(10);
    expect(Math.abs(s.at(-1)!.y - raw.at(-1)!.y)).toBeLessThan(10);
  });

  it("keeps a single tap as a dot", () => {
    expect(cleanStroke([{ x: 5, y: 5 }])).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("composed letters", () => {
  it("builds ö and Ö from the base letter and the drawn ¨, lifting it for capitals", () => {
    const g = composedGlyphs(sample());
    expect(g["ö"]).toHaveLength(3);
    const markTop = (strokes: typeof g.o) => Math.max(...strokes.slice(1).flat().map((p) => p.y));
    expect(markTop(g["Ö"]) - markTop(g["ö"])).toBe(METRICS.capHeight - METRICS.xHeight);
    // centred over the base
    const cx = (s: typeof g.o) => (Math.min(...s.flat().map((p) => p.x)) + Math.max(...s.flat().map((p) => p.x))) / 2;
    expect(Math.abs(cx(g["ö"].slice(1)) - cx(g.o))).toBeLessThanOrEqual(0.5); // rounded to whole font units
    expect(g["ä"]).toBeUndefined(); // no "a" drawn
  });

  it("drawn accented letters win over composed ones", () => {
    const f = sample();
    f.glyphs["ö"] = [[{ x: 0, y: 0 }, { x: 10, y: 10 }]];
    expect(composedGlyphs(f)["ö"]).toEqual(f.glyphs["ö"]);
  });
});

describe("SVG font export", () => {
  it("is read by the same parser as the EMS fonts and lays out text", () => {
    const svg = toSvgFont(sample());
    const font = parseSvgFont(svg);
    expect(font.name).toBe("Test Hand");
    expect(font.ascent).toBeCloseTo(0.8);
    for (const ch of "loOö ") expect(font.glyph(ch), ch).toBeDefined();
    const l = layoutText("lol", font, { size: 10, lineHeight: 1.2, align: "left", width: 0 });
    expect(l.missing).toEqual([]);
    expect(l.strokes.length).toBe(3);
  });

  it("round-trips: download, import, export gives the same font", () => {
    const svg = toSvgFont(sample());
    const back = fromSvgFont(svg);
    expect(toSvgFont(back)).toBe(svg);
  });

  it("escapes XML characters in names and glyphs", () => {
    const f = sample();
    f.name = 'Tom & "Jerry"';
    f.glyphs["<"] = [[{ x: 0, y: 0 }, { x: 100, y: 200 }]];
    expect(() => parseSvgFont(toSvgFont(f))).not.toThrow();
    expect(parseSvgFont(toSvgFont(f)).glyph("<")).toBeDefined();
  });
});

describe("progress", () => {
  it("counts drawn and composed characters", () => {
    expect(progress(sample(), "loö")).toEqual({ done: 3, total: 3 });
    expect(progress(sample(), "abc")).toEqual({ done: 0, total: 3 });
  });
});
