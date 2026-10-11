import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Drawing, Point } from "../geometry";
import { chunkCount, compile, packMoves, splitMove } from "./compile";
import { decodeAll } from "./decode";
import { encode } from "./encode";
import { fromCArray } from "./hex";
import { type Instruction, MAX_COMPONENT, type MoveSize } from "./instructions";
import { DEFAULT_PARAMS, PARAMS } from "./params";
import { trace } from "./trace";

const point = fc.record({
  x: fc.double({ min: -400, max: 400, noNaN: true }),
  y: fc.double({ min: -400, max: 400, noNaN: true }),
});
const drawing: fc.Arbitrary<Drawing> = fc.array(fc.array(point, { maxLength: 15 }), { maxLength: 12 });

/**
 * `actual` visits every vertex of `expected` in order. Points in between are only the split
 * points of long moves, so they lie within half a step of the line between two vertices.
 */
function expectRefines(actual: Point[], expected: Point[]) {
  expect(actual[0]).toEqual(expected[0]);
  let i = 0;
  for (const p of actual.slice(1)) {
    const a = expected[i];
    const b = expected[i + 1];
    expect(b).toBeDefined();
    if (p.x === b.x && p.y === b.y) {
      i++;
      continue;
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const offLine = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    expect(offLine).toBeLessThanOrEqual(Math.SQRT1_2);
  }
  expect(i).toBe(expected.length - 1);
}

const roundtrip =(d: Drawing, params = DEFAULT_PARAMS) =>
  trace(decodeAll(encode(compile(d, params, { header: false }))));

describe("compile", () => {
  it("draws exactly the rounded strokes, returns home with the pen up", () => {
    fc.assert(
      fc.property(drawing, (d) => {
        const toSteps = (p: Point) => ({
          x: Math.round(p.x * DEFAULT_PARAMS.steps_per_mm_x) || 0,
          y: Math.round(p.y * DEFAULT_PARAMS.steps_per_mm_y) || 0,
        });
        const expected = d
          .filter((s) => s.length > 0)
          .map((s) => s.map(toSteps).filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y));

        const t = roundtrip(d);
        expect(t.strokes).toHaveLength(expected.length);
        t.strokes.forEach((s, i) => expectRefines(s, expected[i]));
        expect(t.end).toEqual({ x: 0, y: 0 });
        expect(t.penDown).toBe(false);
      }),
    );
  });

  it("scales the axes independently", () => {
    const t = roundtrip([[{ x: 10, y: 10 }]]);
    expect(t.strokes).toEqual([[{ x: 50, y: 48 }]]); // 5 and 4.76 steps/mm
  });

  it("starts with one SET_PARAM per parameter and ends with END", () => {
    const ins = compile([], DEFAULT_PARAMS);
    expect(ins.filter((i) => i.op === "set_param")).toHaveLength(Object.keys(PARAMS).length);
    expect(ins.at(-1)).toEqual({ op: "end" });
  });

  it("skips empty strokes and draws single points as dots", () => {
    const ins = compile([[], [{ x: 1, y: 1 }]], DEFAULT_PARAMS, { header: false });
    expect(ins.filter((i) => i.op === "pen")).toHaveLength(2);
  });
});

describe("splitMove", () => {
  it("splits into collinear chunks that fit the size and sum to the move", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: -100000, max: 100000 }),
        fc.constantFrom<MoveSize>(4, 8, 16),
        (dx, dy, size) => {
          const n = chunkCount(dx, dy, size);
          const chunks = splitMove(dx, dy, n);
          expect(chunks).toHaveLength(n);
          let x = 0;
          let y = 0;
          chunks.forEach((c, i) => {
            expect(Math.abs(c.x)).toBeLessThanOrEqual(MAX_COMPONENT[size]);
            expect(Math.abs(c.y)).toBeLessThanOrEqual(MAX_COMPONENT[size]);
            x += c.x;
            y += c.y;
            expect(Math.abs(x - (dx * (i + 1)) / n)).toBeLessThanOrEqual(0.5);
            expect(Math.abs(y - (dy * (i + 1)) / n)).toBeLessThanOrEqual(0.5);
          });
          expect({ x, y }).toEqual({ x: dx, y: dy });
        },
      ),
    );
  });
});

describe("packMoves", () => {
  const moves = fc.array(
    fc.oneof(
      fc.constant({ op: "pen" as const }),
      fc.record({
        op: fc.constant("move" as const),
        dx: fc.integer({ min: -3000, max: 3000 }),
        dy: fc.integer({ min: -3000, max: 3000 }),
      }),
    ),
    { maxLength: 40 },
  );

  /** Encoded size when every move uses one fixed size. */
  const fixedSize = (tokens: Parameters<typeof packMoves>[0], size: MoveSize) =>
    encode([
      { op: "size", bits: size },
      ...tokens.flatMap((t): Instruction[] =>
        t.op !== "move" ? [t] : splitMove(t.dx, t.dy, chunkCount(t.dx, t.dy, size)).map((c) => ({ op: "move" as const, dx: c.x, dy: c.y })),
      ),
      { op: "end" },
    ]).length;

  it("is never larger than any single fixed size", () => {
    fc.assert(
      fc.property(moves, (tokens) => {
        const packed = encode([...packMoves(tokens), { op: "end" }]).length;
        for (const s of [4, 8, 16] as const) expect(packed).toBeLessThanOrEqual(fixedSize(tokens, s));
      }),
    );
  });

  it("is never larger than v1 on the handdrawing sample", () => {
    const repo = new URL("../../../../", import.meta.url);
    const v1 = fromCArray(readFileSync(new URL("legacy/samples/handdrawing.v1.txt", repo), "utf8"));
    const strokes = trace(decodeAll(v1)).strokes;
    const params = { ...DEFAULT_PARAMS, steps_per_mm_x: 1, steps_per_mm_y: 1 };
    const v2 = encode(compile(strokes, params, { header: false }));

    expect(trace(decodeAll(v2)).strokes).toEqual(strokes);
    expect(v2.length).toBeLessThanOrEqual(v1.length);
  });
});
