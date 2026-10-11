import { describe, expect, it } from "vitest";
import { calibrationSheet, DEFAULT_CALIBRATION, parseList } from "./calibration";
import { DEFAULT_PARAMS } from "./quickstep/params";
import { trace } from "./quickstep/trace";
import { simulate } from "./sim/simulate";

describe("calibrationSheet", () => {
  const sheet = calibrationSheet(DEFAULT_CALIBRATION, DEFAULT_PARAMS);

  it("has one cell per speed and acceleration", () => {
    expect(sheet.cells).toHaveLength(16);
    expect(new Set(sheet.cells.map((c) => `${c.speed}/${c.accelX}`)).size).toBe(16);
  });

  it("draws the frame first and last at the same place, and returns home with the pen up", () => {
    const t = trace(sheet.instructions);
    expect(t.strokes[0]).toEqual(t.strokes.at(-1));
    expect(t.strokes).toHaveLength(2 + 16 * 3);
    expect(t.end).toEqual({ x: 0, y: 0 });
    expect(t.penDown).toBe(false);
  });

  it("each cell runs with its own limits", () => {
    const sim = simulate(sheet.instructions);
    const draws = sim.events.filter((e) => e.kind === "move" && e.penDown);
    const perStroke = new Map<number, number>();
    // strokes are drawn in order: frame, then 3 per cell, then frame
    let stroke = -1;
    let wasDown = false;
    for (const e of sim.events) {
      if (e.kind === "pen") {
        if (e.down && !wasDown) stroke++;
        wasDown = e.down;
      } else if (e.kind === "move" && e.penDown) {
        perStroke.set(stroke, Math.max(perStroke.get(stroke) ?? 0, e.profile.peak));
      }
    }
    expect(draws.length).toBeGreaterThan(0);
    sheet.cells.forEach((cell, i) => {
      for (let k = 0; k < 3; k++) {
        expect(perStroke.get(1 + i * 3 + k)!).toBeLessThanOrEqual(cell.speed + 1e-6);
      }
    });
    // the fast, high-acceleration cells really get faster than the default 20 mm/s
    expect(Math.max(...perStroke.values())).toBeGreaterThan(40);
  });
});

describe("parseList", () => {
  it("reads numbers separated by commas or spaces", () => {
    expect(parseList("20, 40  80;x, -3")).toEqual([20, 40, 80]);
  });
});
