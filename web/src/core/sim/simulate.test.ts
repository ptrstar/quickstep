import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../quickstep/compile";
import { decodeAll } from "../quickstep/decode";
import { fromCArray } from "../quickstep/hex";
import type { Instruction } from "../quickstep/instructions";
import { DEFAULT_PARAMS, PARAMS } from "../quickstep/params";
import { simulate, stateAt, stats } from "./simulate";

// Pen: 20 steps at 400 steps/s, 4000 steps/s² → triangle peaking at sqrt(4000·20)
const PEN = (2 * Math.sqrt(4000 * 20)) / 4000;
const LINE_100MM = 100 / 20 + 20 / 300;

describe("simulate", () => {
  const line: Instruction[] = [{ op: "pen" }, { op: "size", bits: 16 }, { op: "move", dx: 500, dy: 0 }, { op: "pen" }, { op: "end" }];

  it("times a pen-down line: two pen moves plus a trapezoid", () => {
    const sim = simulate(line);
    expect(sim.duration).toBeCloseTo(2 * PEN + LINE_100MM, 9);
    const s = stats(sim);
    expect(s.penToggles).toBe(2);
    expect(s.drawDistance).toBeCloseTo(100, 9);
    expect(s.peakSpeed).toBe(20);
    expect(s.maxStepRateX).toBeCloseTo(20 * 5 * 8, 9); // mm/s · steps/mm · microsteps
  });

  it("reports position, speed and pen state over time", () => {
    const sim = simulate(line);
    const mid = stateAt(sim, PEN + LINE_100MM / 2);
    expect(mid.position.x).toBeCloseTo(50, 9);
    expect(mid.speed).toBe(20);
    expect(mid.penDown).toBe(true);
    expect(stateAt(sim, 0).penDown).toBe(true); // lowering
    expect(stateAt(sim, sim.duration).position.x).toBeCloseTo(100, 9);
  });

  it("applies SET_PARAM to later moves", () => {
    const faster: Instruction[] = [{ op: "set_param", id: PARAMS.draw_speed.id, value: 40 }, ...line];
    expect(simulate(faster).duration).toBeCloseTo(2 * PEN + 100 / 40 + 40 / 300, 9);
  });

  it("dwell and pen settle add time", () => {
    const sim = simulate([{ op: "dwell", ms: 250 }, ...line], { ...DEFAULT_PARAMS, pen_settle_ms: 100 });
    expect(sim.duration).toBeCloseTo(0.25 + 2 * (PEN + 0.1) + LINE_100MM, 9);
  });

  it("a compiled square stops at no corner except where required", () => {
    const square = [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }]];
    const sim = simulate(compile(square, DEFAULT_PARAMS));
    const corners = sim.events.filter((e) => e.kind === "move" && e.penDown).map((e) => (e.kind === "move" ? e.profile.exit : 0));
    expect(corners.slice(0, -1).every((v) => v > 0)).toBe(true);
    expect(corners.at(-1)).toBe(0); // pen lifts
  });

  it("runs the v1 handdrawing sample", () => {
    const repo = new URL("../../../../", import.meta.url);
    const bytes = fromCArray(readFileSync(new URL("legacy/samples/handdrawing.v1.txt", repo), "utf8"));
    const sim = simulate(decodeAll(bytes));
    const s = stats(sim);
    expect(s.penToggles).toBe(172);
    expect(Number.isFinite(sim.duration)).toBe(true);
    expect(s.peakSpeed).toBeLessThanOrEqual(DEFAULT_PARAMS.travel_speed);
    const end = stateAt(sim, sim.duration);
    expect(end.position.x).toBeCloseTo(0, 6);
    expect(end.position.y).toBeCloseTo(0, 6);
    expect(end.penDown).toBe(false);
  });
});
