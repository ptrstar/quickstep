import type { Point } from "../geometry";
import type { Instruction } from "../quickstep/instructions";
import { DEFAULT_PARAMS, type MachineParams, paramName } from "../quickstep/params";
import { LOOKAHEAD, planRun, type Segment, segment } from "./planner";
import { sample, type Trapezoid, trapezoid } from "./trapezoid";

export type MoveEvent = {
  kind: "move";
  t0: number;
  duration: number;
  /** Positions in mm relative to the job start. */
  from: Point;
  to: Point;
  penDown: boolean;
  profile: Trapezoid;
  /** Peak step rates (microsteps/s) on each axis during this move. */
  stepRateX: number;
  stepRateY: number;
};

export type PenEvent = { kind: "pen"; t0: number; duration: number; at: Point; down: boolean };

export type WaitEvent = {
  kind: "dwell" | "pause" | "end";
  t0: number;
  duration: number;
  at: Point;
};

export type SimEvent = MoveEvent | PenEvent | WaitEvent;

export type Simulation = {
  events: SimEvent[];
  duration: number;
  /** Parameters in effect at the end of the program. */
  params: MachineParams;
};

/**
 * Runs a program through the motion model of SPEC §7. Assumes the host keeps the device's buffer
 * full, so the planner always sees the next LOOKAHEAD segments (or up to the next barrier).
 * `initial` are the parameters the device holds before the program starts.
 */
export function simulate(
  instructions: Iterable<Instruction>,
  initial: MachineParams = DEFAULT_PARAMS,
  lookahead = LOOKAHEAD,
): Simulation {
  const events: SimEvent[] = [];
  let params = { ...initial };
  let t = 0;
  let pos: Point = { x: 0, y: 0 };
  let penDown = false;

  // Moves since the last barrier, planned together when the next barrier arrives.
  let run: { segment: Segment; from: Point; to: Point }[] = [];

  const flush = () => {
    const profiles = planRun(
      run.map((r) => r.segment),
      params.junction_deviation,
      lookahead,
    );
    profiles.forEach((profile, i) => {
      const { segment: s, from, to } = run[i];
      events.push({
        kind: "move",
        t0: t,
        duration: profile.duration,
        from,
        to,
        penDown,
        profile,
        stepRateX: profile.peak * Math.abs(s.ux) * params.steps_per_mm_x * params.microsteps_x,
        stepRateY: profile.peak * Math.abs(s.uy) * params.steps_per_mm_y * params.microsteps_y,
      });
      t += profile.duration;
    });
    run = [];
  };
  const wait = (kind: WaitEvent["kind"], duration: number) => {
    events.push({ kind, t0: t, duration, at: pos });
    t += duration;
  };

  for (const ins of instructions) {
    switch (ins.op) {
      case "move": {
        const to = { x: pos.x + ins.dx / params.steps_per_mm_x, y: pos.y + ins.dy / params.steps_per_mm_y };
        const s = segment(to.x - pos.x, to.y - pos.y, penDown, params);
        if (s) run.push({ segment: s, from: pos, to });
        pos = to;
        break;
      }
      case "pen": {
        flush();
        penDown = !penDown;
        const lift = trapezoid(params.pen_lift_steps, params.pen_accel, 0, 0, params.pen_speed);
        const duration = lift.duration + params.pen_settle_ms / 1000;
        events.push({ kind: "pen", t0: t, duration, at: pos, down: penDown });
        t += duration;
        break;
      }
      case "set_param": {
        flush();
        const name = paramName(ins.id);
        if (name) params = { ...params, [name]: ins.value };
        break;
      }
      case "reset_params":
        flush();
        params = { ...DEFAULT_PARAMS };
        break;
      case "dwell":
        flush();
        wait("dwell", ins.ms / 1000);
        break;
      case "pause":
        flush();
        wait("pause", 0);
        break;
      case "motors_off":
        flush();
        break;
      case "end":
        flush();
        wait("end", 0);
        break;
      // size, nop, resume: no motion
    }
  }
  flush();
  return { events, duration: t, params };
}

/** Index of the event running at time `t` (the last one with t0 ≤ t). */
export function eventIndexAt(sim: Simulation, t: number): number {
  const { events } = sim;
  let lo = 0;
  let hi = events.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export type MachineState = { position: Point; speed: number; penDown: boolean; index: number };

/** Pen position, path speed and pen state at time `t`. */
export function stateAt(sim: Simulation, t: number): MachineState {
  const index = eventIndexAt(sim, t);
  if (index < 0) return { position: { x: 0, y: 0 }, speed: 0, penDown: false, index };
  const e = sim.events[index];
  if (e.kind === "move") {
    const { distance, speed } = sample(e.profile, t - e.t0);
    const f = e.profile.length > 0 ? distance / e.profile.length : 1;
    const position = { x: e.from.x + (e.to.x - e.from.x) * f, y: e.from.y + (e.to.y - e.from.y) * f };
    return { position, speed, penDown: e.penDown, index };
  }
  // A pen event counts as down once it starts lowering, and as up once it starts lifting.
  const penDown = e.kind === "pen" ? e.down : penStateBefore(sim, index);
  return { position: e.at, speed: 0, penDown, index };
}

function penStateBefore(sim: Simulation, index: number): boolean {
  for (let i = index; i >= 0; i--) {
    const e = sim.events[i];
    if (e.kind === "pen") return e.down;
    if (e.kind === "move") return e.penDown;
  }
  return false;
}

export type SimStats = {
  duration: number;
  drawTime: number;
  travelTime: number;
  penTime: number;
  waitTime: number;
  drawDistance: number;
  travelDistance: number;
  moves: number;
  penToggles: number;
  peakSpeed: number;
  /** Average speed over pen-down moves. */
  drawSpeed: number;
  maxStepRateX: number;
  maxStepRateY: number;
};

export function stats(sim: Simulation): SimStats {
  const s: SimStats = {
    duration: sim.duration,
    drawTime: 0,
    travelTime: 0,
    penTime: 0,
    waitTime: 0,
    drawDistance: 0,
    travelDistance: 0,
    moves: 0,
    penToggles: 0,
    peakSpeed: 0,
    drawSpeed: 0,
    maxStepRateX: 0,
    maxStepRateY: 0,
  };
  for (const e of sim.events) {
    if (e.kind === "move") {
      s.moves++;
      if (e.penDown) {
        s.drawTime += e.duration;
        s.drawDistance += e.profile.length;
      } else {
        s.travelTime += e.duration;
        s.travelDistance += e.profile.length;
      }
      s.peakSpeed = Math.max(s.peakSpeed, e.profile.peak);
      s.maxStepRateX = Math.max(s.maxStepRateX, e.stepRateX);
      s.maxStepRateY = Math.max(s.maxStepRateY, e.stepRateY);
    } else if (e.kind === "pen") {
      s.penToggles++;
      s.penTime += e.duration;
    } else {
      s.waitTime += e.duration;
    }
  }
  s.drawSpeed = s.drawTime > 0 ? s.drawDistance / s.drawTime : 0;
  return s;
}
