import type { Drawing, Point, Stroke } from "./geometry";
import { header, packMoves, strokeTokens, type Token } from "./quickstep/compile";
import type { Instruction } from "./quickstep/instructions";
import { type MachineParams, PARAMS } from "./quickstep/params";

/**
 * Calibration sheet: a grid of identical test cells. Columns vary the drawing speed, rows the
 * acceleration (Y as a fraction of X, since the friction drive slips first). Every cell has 90°
 * corners, acute zigzag corners and reversals. A frame around the grid is drawn at the start and
 * again at the end: if any axis lost steps or the paper slipped, the two frames do not line up.
 */
export type CalibrationConfig = {
  speeds: number[]; // mm/s, one column each
  accels: number[]; // mm/s² on x, one row each
  yRatio: number; // accel_y = accel_x · yRatio
  deviation: number; // junction deviation δ, mm
  cell: number; // mm
  gap: number; // mm
};

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  speeds: [20, 40, 80, 120],
  accels: [300, 600, 1200, 2400],
  yRatio: 0.5,
  deviation: 0.05,
  cell: 18,
  gap: 6,
};

export type CalibrationCell = { row: number; col: number; origin: Point; speed: number; accelX: number; accelY: number };

/** The test pattern of one cell, `c` mm wide, at `o`. */
export function cellPattern(o: Point, c: number): Drawing {
  const p = (x: number, y: number): Point => ({ x: o.x + x * c, y: o.y + y * c });
  const square: Stroke = [p(0, 0), p(1, 0), p(1, 1), p(0, 1), p(0, 0)];
  const zigzag: Stroke = Array.from({ length: 9 }, (_, i) => p(0.1 + (0.8 * i) / 8, i % 2 ? 0.2 : 0.45));
  const cross: Stroke = [p(0.5, 0.55), p(0.5, 0.9), p(0.5, 0.55), p(0.15, 0.725), p(0.85, 0.725)];
  return [square, zigzag, cross];
}

export function calibrationSheet(cfg: CalibrationConfig, base: MachineParams) {
  const pitch = cfg.cell + cfg.gap;
  const width = cfg.speeds.length * pitch - cfg.gap;
  const height = cfg.accels.length * pitch - cfg.gap;
  const m = cfg.gap / 2;
  const frame: Drawing = [
    [
      { x: -m, y: -m },
      { x: width + m, y: -m },
      { x: width + m, y: height + m },
      { x: -m, y: height + m },
      { x: -m, y: -m },
    ],
  ];

  const tokens: Token[] = [];
  let at: Point = { x: 0, y: 0 };
  const draw = (d: Drawing, params: MachineParams) => {
    const r = strokeTokens(d, params, at);
    tokens.push(...r.tokens);
    at = r.at;
  };
  const set = (values: Partial<MachineParams>) => {
    for (const [name, value] of Object.entries(values)) {
      tokens.push({ op: "set_param", id: PARAMS[name as keyof MachineParams].id, value: value! });
    }
  };

  draw(frame, base);
  const cells: CalibrationCell[] = [];
  cfg.accels.forEach((accelX, row) => {
    cfg.speeds.forEach((speed, col) => {
      const accelY = accelX * cfg.yRatio;
      const origin = { x: col * pitch, y: row * pitch };
      cells.push({ row, col, origin, speed, accelX, accelY });
      // Raise the axis limits so the cell really runs at its speed.
      set({
        draw_speed: speed,
        max_speed_x: Math.max(base.max_speed_x, speed),
        max_speed_y: Math.max(base.max_speed_y, speed),
        accel_x: accelX,
        accel_y: accelY,
        junction_deviation: cfg.deviation,
      });
      draw(cellPattern(origin, cfg.cell), base);
    });
  });
  // back to the machine's own settings for the second frame
  set({
    draw_speed: base.draw_speed,
    max_speed_x: base.max_speed_x,
    max_speed_y: base.max_speed_y,
    accel_x: base.accel_x,
    accel_y: base.accel_y,
    junction_deviation: base.junction_deviation,
  });
  draw(frame, base);
  if (at.x || at.y) tokens.push({ op: "move", dx: -at.x, dy: -at.y });

  const instructions: Instruction[] = [...header(base), ...packMoves(tokens), { op: "end" }];
  return { instructions, cells, size: { width: width + cfg.gap, height: height + cfg.gap } };
}

/** "20, 40, 80" → [20, 40, 80]; ignores anything that is not a positive number. */
export function parseList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
}
