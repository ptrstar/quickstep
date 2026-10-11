import type { MachineParams } from "../quickstep/params";
import { type Trapezoid, trapezoid } from "./trapezoid";

/** Number of segments the planner holds (SPEC §7). The firmware uses the same value. */
export const LOOKAHEAD = 20;

export type Segment = {
  /** Length in mm. */
  length: number;
  /** Unit direction. */
  ux: number;
  uy: number;
  /** Speed limit for this segment (pen-dependent, capped per axis), mm/s. */
  nominal: number;
  /** Acceleration limit along this segment, mm/s². */
  accel: number;
};

/** Builds a segment from a move in mm with the axis limits of `params`. Null for zero length. */
export function segment(dxMm: number, dyMm: number, penDown: boolean, params: MachineParams): Segment | null {
  const length = Math.hypot(dxMm, dyMm);
  if (length === 0) return null;
  const ux = dxMm / length;
  const uy = dyMm / length;
  let nominal = penDown ? params.draw_speed : params.travel_speed;
  let accel = Infinity;
  if (ux !== 0) {
    nominal = Math.min(nominal, params.max_speed_x / Math.abs(ux));
    accel = Math.min(accel, params.accel_x / Math.abs(ux));
  }
  if (uy !== 0) {
    nominal = Math.min(nominal, params.max_speed_y / Math.abs(uy));
    accel = Math.min(accel, params.accel_y / Math.abs(uy));
  }
  return { length, ux, uy, nominal, accel };
}

/**
 * Highest speed allowed through the corner between `a` and `b` (junction deviation, SPEC §7).
 * Infinity when going straight on, 0 for a full reversal; capped by both nominal speeds.
 */
export function junctionSpeed(a: Segment, b: Segment, deviation: number): number {
  // sin(θ/2) = |u1 + u2| / 2 for unit vectors. Same as sqrt((1 - cos θ) / 2), but without the
  // cancellation that makes a float32 reversal come out slightly above zero (firmware).
  const s = Math.min(1, Math.hypot(a.ux + b.ux, a.uy + b.uy) / 2);
  const accel = Math.min(a.accel, b.accel);
  const vj = 1 - s < 1e-9 ? Infinity : Math.sqrt((accel * deviation * s) / (1 - s));
  return Math.min(vj, a.nominal, b.nominal);
}

/**
 * Plans a run of segments that starts and ends at rest (between two barriers).
 *
 * When segment i starts, the planner knows segments i … i+LOOKAHEAD-1. The last one it knows
 * must end at rest. A backward pass over that window gives the highest exit speed of segment i
 * from which it can still stop in time. The forward limit is what acceleration can reach from
 * the fixed entry speed. The profile of segment i is frozen with the lower of the two.
 */
export function planRun(segments: Segment[], deviation: number, lookahead = LOOKAHEAD): Trapezoid[] {
  const n = segments.length;
  // junction[k]: speed limit between segments k-1 and k
  const junction = segments.map((s, k) => (k === 0 ? 0 : junctionSpeed(segments[k - 1], s, deviation)));

  const profiles: Trapezoid[] = [];
  let entry = 0;
  for (let i = 0; i < n; i++) {
    const last = Math.min(i + lookahead - 1, n - 1);
    let bound = 0;
    for (let k = last; k > i; k--) {
      const s = segments[k];
      bound = Math.min(junction[k], Math.sqrt(bound * bound + 2 * s.accel * s.length));
    }
    const s = segments[i];
    const exit = Math.min(bound, Math.sqrt(entry * entry + 2 * s.accel * s.length));
    profiles.push(trapezoid(s.length, s.accel, entry, exit, s.nominal));
    entry = exit;
  }
  return profiles;
}
