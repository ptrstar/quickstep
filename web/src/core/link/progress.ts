import { LOOKAHEAD } from "../sim/planner";
import type { Simulation } from "../sim/simulate";
import { boundaryAt, type Job } from "./job";

/** Start time of every move in the simulation, in order. */
export function moveStartTimes(sim: Simulation): number[] {
  return sim.events.flatMap((e) => (e.kind === "move" ? [e.t0] : []));
}

/**
 * Where the plotter probably is, from the bytes its decoder has taken (the credits).
 * `frontier`: simulated time of the last decoded move. `plotted`: about LOOKAHEAD moves earlier,
 * since that many wait in the planner. Both in seconds of the job's simulation.
 */
export function estimateProgress(
  sim: Simulation,
  starts: number[],
  job: Job,
  consumed: number,
): { frontier: number; plotted: number } {
  if (consumed >= job.bytes.length) {
    return { frontier: sim.duration, plotted: starts[Math.max(0, starts.length - LOOKAHEAD)] ?? sim.duration };
  }
  const decoded = boundaryAt(job, consumed).moves;
  const at = (n: number) => (n >= starts.length ? sim.duration : starts[Math.max(0, n)] ?? 0);
  return { frontier: at(decoded), plotted: Math.min(at(decoded - LOOKAHEAD), at(decoded)) };
}
