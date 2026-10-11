import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeAll } from "./decode";
import { fromCArray, fromHex } from "./hex";
import type { Instruction } from "./instructions";
import { StreamDecoder } from "./streamDecoder";

const repo = new URL("../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");

/** Feeds bytes one at a time, so every instruction is interrupted wherever it can be. */
function trickle(bytes: Uint8Array): { instructions: Instruction[]; error: number } {
  const d = new StreamDecoder();
  const instructions: Instruction[] = [];
  let available = 0;
  let pos = 0;
  const readByte = () => (pos < available ? bytes[pos++] : -1);
  for (;;) {
    const r = d.next(readByte);
    if (r === "need-more") {
      if (available >= bytes.length) break;
      available++;
    } else if ("error" in r) {
      return { instructions, error: r.error };
    } else {
      instructions.push(r);
    }
  }
  return { instructions, error: 0 };
}

describe("StreamDecoder", () => {
  const encoding: { name: string; bytes: string; instructions: Instruction[] }[] = JSON.parse(read("protocol/vectors/encoding.json"));
  const errors: { name: string; bytes: string; error: number }[] = JSON.parse(read("protocol/vectors/errors.json"));

  it.each(encoding.map((v) => [v.name, v] as const))("decodes %s byte by byte", (_, v) => {
    expect(trickle(fromHex(v.bytes))).toEqual({ instructions: v.instructions, error: 0 });
  });

  it.each(errors.map((v) => [v.name, v] as const))("reports %s", (_, v) => {
    expect(trickle(fromHex(v.bytes)).error).toBe(v.error);
  });

  it("agrees with the batch decoder on the v1 sample", () => {
    const bytes = fromCArray(read("legacy/samples/handdrawing.v1.txt"));
    expect(trickle(bytes).instructions).toEqual(decodeAll(bytes));
  });
});
