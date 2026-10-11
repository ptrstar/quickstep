import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeAll, QuickstepError, TruncatedError } from "./decode";
import { encode } from "./encode";
import { fromCArray, fromHex, toHex } from "./hex";
import type { Instruction } from "./instructions";
import { trace } from "./trace";

const repo = new URL("../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");

type EncodingVector = { name: string; description: string; instructions: Instruction[]; bytes: string };
type ErrorVector = { name: string; bytes: string; error: number };

const encoding: EncodingVector[] = JSON.parse(read("protocol/vectors/encoding.json"));
const errors: ErrorVector[] = JSON.parse(read("protocol/vectors/errors.json"));

describe("protocol/vectors/encoding.json", () => {
  it.each(encoding.map((v) => [v.name, v] as const))("encodes %s", (_, v) => {
    expect(toHex(encode(v.instructions))).toBe(v.bytes);
  });

  it.each(encoding.map((v) => [v.name, v] as const))("decodes %s", (_, v) => {
    expect(decodeAll(fromHex(v.bytes))).toEqual(v.instructions);
  });
});

describe("protocol/vectors/errors.json", () => {
  it.each(errors.map((v) => [v.name, v] as const))("rejects %s", (_, v) => {
    const run = () => decodeAll(fromHex(v.bytes));
    expect(run).toThrow(QuickstepError);
    try {
      run();
    } catch (e) {
      expect((e as QuickstepError).code).toBe(v.error);
    }
  });
});

describe("truncated streams", () => {
  it.each([
    ["move data missing", "0E 01"],
    ["ext opcode missing", "0D"],
    ["set_param payload missing", "3D 03 14 00 00"],
  ])("%s", (_, hex) => {
    expect(() => decodeAll(fromHex(hex))).toThrow(TruncatedError);
  });
});

describe("legacy v1 sample (handdrawing)", () => {
  const bytes = fromCArray(read("legacy/samples/handdrawing.v1.txt"));
  const instructions = decodeAll(bytes);
  const t = trace(instructions);

  it("decodes completely and ends with END", () => {
    expect(bytes.length).toBe(22210);
    expect(instructions.at(-1)).toEqual({ op: "end" });
    expect(instructions.filter((i) => i.op === "end")).toHaveLength(1);
  });

  it("draws 86 strokes from 17733 moves and returns home with the pen up", () => {
    expect(t.strokes).toHaveLength(86);
    expect(t.moves).toBe(17733);
    expect(t.end).toEqual({ x: 0, y: 0 });
    expect(t.penDown).toBe(false);
  });

  it("re-encodes to the identical bytes", () => {
    expect(encode(instructions)).toEqual(bytes);
  });
});
