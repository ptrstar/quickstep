import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeAll } from "./decode";
import { encode } from "./encode";
import type { Instruction, MoveSize } from "./instructions";
import { PARAMS } from "./params";

const RANGE: Record<MoveSize, [number, number]> = { 4: [-8, 7], 8: [-128, 127], 16: [-32768, 32767] };

/** Random valid programs: moves fit the current size, PAUSE is always followed by RESUME. */
const program = fc
  .array(
    fc.oneof(
      fc.constant<Instruction[]>([{ op: "pen" }]),
      fc.constantFrom<MoveSize>(4, 8, 16).map((bits): Instruction[] => [{ op: "size", bits }]),
      fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })).map(
        ([a, b]): Instruction[] => [{ op: "move", dx: a, dy: b }], // scaled to the current size below
      ),
      fc.constant<Instruction[]>([{ op: "pause" }, { op: "resume" }]),
      fc.constantFrom(...Object.values(PARAMS).map((p) => p.id)).chain((id) =>
        fc.float({ noNaN: true }).map((value): Instruction[] => [{ op: "set_param", id, value }]),
      ),
      fc.integer({ min: 0, max: 0xffff }).map((ms): Instruction[] => [{ op: "dwell", ms }]),
      fc.constantFrom<Instruction[]>([{ op: "nop" }], [{ op: "motors_off" }], [{ op: "reset_params" }], [{ op: "end" }]),
    ),
    { maxLength: 60 },
  )
  .map((groups) => {
    let size: MoveSize = 8;
    const out: Instruction[] = [];
    for (const ins of groups.flat()) {
      if (ins.op === "size") size = ins.bits;
      if (ins.op === "end") size = 8;
      if (ins.op === "move") {
        const [lo, hi] = RANGE[size];
        const scale = (t: number) => Math.round(lo + t * (hi - lo));
        out.push({ op: "move", dx: scale(ins.dx), dy: scale(ins.dy) });
      } else {
        out.push(ins);
      }
    }
    out.push({ op: "end" });
    return out;
  });

describe("encode ⇄ decode", () => {
  it("round-trips any valid program", () => {
    fc.assert(
      fc.property(program, (instructions) => {
        expect(decodeAll(encode(instructions))).toEqual(instructions);
      }),
    );
  });
});

describe("encode validation", () => {
  it.each([
    [4, 8, 0],
    [4, 0, -9],
    [8, 128, 0],
    [16, 0, 32768],
  ] as const)("rejects int%i move (%i, %i)", (bits, dx, dy) => {
    expect(() => encode([{ op: "size", bits }, { op: "move", dx, dy }])).toThrow(RangeError);
  });

  it("rejects non-integer moves", () => {
    expect(() => encode([{ op: "move", dx: 0.5, dy: 0 }])).toThrow(RangeError);
  });

  it("rejects unknown parameter ids and bad dwell", () => {
    expect(() => encode([{ op: "set_param", id: 0x99, value: 1 }])).toThrow(RangeError);
    expect(() => encode([{ op: "dwell", ms: 70000 }])).toThrow(RangeError);
  });
});
