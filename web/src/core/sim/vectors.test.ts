// Golden planner vectors for the firmware (protocol/vectors/planner.json).
// Regenerate after an intended change to the motion model:  UPDATE_VECTORS=1 npm test
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { spiral, star, zigzags } from "../demo";
import { compile } from "../quickstep/compile";
import { decodeAll } from "../quickstep/decode";
import { encode } from "../quickstep/encode";
import { fromCArray, toHex } from "../quickstep/hex";
import type { Instruction } from "../quickstep/instructions";
import { DEFAULT_PARAMS, type MachineParams, PARAMS, type ParamName } from "../quickstep/params";
import { simulate, stats } from "./simulate";

const repo = new URL("../../../../", import.meta.url);
const FILE = new URL("protocol/vectors/planner.json", repo);

/** Per-move profiles are listed up to this many moves; longer programs only get totals. */
const MAX_LISTED_MOVES = 2000;

const round = (v: number) => Number(v.toPrecision(7));

type Case = { name: string; description: string; params?: Partial<MachineParams>; instructions: Instruction[] };

function cases(): Case[] {
  const fast: Partial<MachineParams> = { draw_speed: 100, travel_speed: 150, max_speed_y: 100, accel_x: 1000, accel_y: 500 };
  const line: Instruction[] = [{ op: "pen" }, { op: "size", bits: 16 }, { op: "move", dx: 500, dy: 0 }, { op: "pen" }, { op: "end" }];
  const square = [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }]];
  const sample = decodeAll(fromCArray(readFileSync(new URL("legacy/samples/handdrawing.v1.txt", repo), "utf8")));
  return [
    { name: "line_100mm", description: "Pen down, 100 mm along x, pen up.", instructions: line },
    { name: "square", description: "20 mm square: three 90° junctions.", instructions: compile(square, DEFAULT_PARAMS) },
    { name: "star", description: "Rays out and back: reversals and travel.", instructions: compile(star(), DEFAULT_PARAMS) },
    { name: "zigzags", description: "Increasingly sharp corners.", instructions: compile(zigzags(), DEFAULT_PARAMS) },
    {
      name: "spiral_fast",
      description: "Dense 1 mm segments at high limits: lookahead-bound speeds.",
      params: fast,
      instructions: compile(spiral(), { ...DEFAULT_PARAMS, ...fast }),
    },
    {
      name: "barriers",
      description: "SET_PARAM, DWELL, PAUSE/RESUME and pen settle between moves.",
      instructions: [
        { op: "set_param", id: PARAMS.pen_settle_ms.id, value: 50 },
        ...line.slice(0, -1),
        { op: "dwell", ms: 300 },
        { op: "set_param", id: PARAMS.accel_x.id, value: 1200 },
        { op: "move", dx: -250, dy: 100 },
        { op: "pause" },
        { op: "resume" },
        { op: "move", dx: -250, dy: -100 },
        { op: "end" },
      ],
    },
    { name: "handdrawing_v1", description: "Real v1 drawing, totals only.", instructions: sample },
  ];
}

function generate() {
  return cases().map((c) => {
    const params = { ...DEFAULT_PARAMS, ...c.params };
    // Simulate what the device decodes (parameter values rounded to f32).
    const bytes = encode(c.instructions);
    const sim = simulate(decodeAll(bytes), params);
    const s = stats(sim);
    const moves = sim.events.flatMap((e) =>
      e.kind === "move" ? [[e.profile.entry, e.profile.exit, e.profile.peak, e.duration].map(round)] : [],
    );
    return {
      name: c.name,
      description: c.description,
      params: (Object.keys(PARAMS) as ParamName[]).map((n) => [PARAMS[n].id, params[n]]),
      bytes: toHex(bytes),
      duration: round(sim.duration),
      moveCount: s.moves,
      penToggles: s.penToggles,
      moves: moves.length <= MAX_LISTED_MOVES ? moves : null,
    };
  });
}

describe("protocol/vectors/planner.json", () => {
  it("matches the simulator", () => {
    const vectors = generate();
    if (process.env.UPDATE_VECTORS) {
      writeFileSync(FILE, JSON.stringify(vectors, null, 1) + "\n");
    }
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(vectors)));
  });
});
