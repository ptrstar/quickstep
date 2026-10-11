import { describe, expect, it } from "vitest";
import { spiral } from "../demo";
import { compile } from "../quickstep/compile";
import { DEFAULT_PARAMS } from "../quickstep/params";
import { simulate } from "../sim/simulate";
import { buildJob } from "./job";
import { estimateProgress, moveStartTimes } from "./progress";

describe("estimateProgress", () => {
  const job = buildJob(compile(spiral(4), DEFAULT_PARAMS));
  const sim = simulate(job.instructions);
  const starts = moveStartTimes(sim);

  it("starts at zero, ends at the job's duration and never goes back", () => {
    expect(estimateProgress(sim, starts, job, 0)).toEqual({ frontier: 0, plotted: 0 });
    let prev = { frontier: 0, plotted: 0 };
    for (let c = 0; c <= job.bytes.length; c += 7) {
      const p = estimateProgress(sim, starts, job, c);
      expect(p.plotted).toBeLessThanOrEqual(p.frontier);
      expect(p.frontier).toBeGreaterThanOrEqual(prev.frontier);
      expect(p.plotted).toBeGreaterThanOrEqual(prev.plotted);
      prev = p;
    }
    expect(estimateProgress(sim, starts, job, job.bytes.length).frontier).toBe(sim.duration);
  });

  it("the plotted estimate trails the decoder by the lookahead", () => {
    const mid = job.boundaries[Math.floor(job.boundaries.length / 2)];
    const p = estimateProgress(sim, starts, job, mid.offset);
    expect(p.frontier).toBe(starts[mid.moves]);
    expect(p.plotted).toBe(starts[mid.moves - 20]);
  });
});
