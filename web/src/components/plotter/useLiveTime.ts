"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { estimateProgress, moveStartTimes } from "@/core/link/progress";
import type { Plotter } from "./usePlotter";

const RUNNING = new Set(["streaming", "pausing", "paused", "stopping", "finishing", "ready"]);

/**
 * Smooth estimate of where the plotter is in its job's simulation. Credits only arrive every few
 * dozen bytes, so between them the time runs on with the wall clock, but never past the decoder's
 * frontier. Undefined when no job is running.
 */
export function useLiveTime(plotter: Plotter): number | undefined {
  const active = plotter.active;
  const starts = useMemo(() => (active ? moveStartTimes(active.sim) : []), [active]);
  const [time, setTime] = useState<number>();
  const anchor = useRef({ plotted: -1, wall: 0 });
  const state = useRef(plotter.state);
  const consumed = useRef(0);

  useEffect(() => {
    state.current = plotter.state;
    consumed.current = plotter.progress?.consumed ?? 0;
  });

  useEffect(() => {
    if (!active) return;
    anchor.current = { plotted: -1, wall: performance.now() };
    let frame = requestAnimationFrame(function tick(now) {
      const est = estimateProgress(active.sim, starts, active.job, consumed.current);
      if (est.plotted !== anchor.current.plotted) anchor.current = { plotted: est.plotted, wall: now };
      const running = state.current !== "paused" && RUNNING.has(state.current);
      const t = running
        ? Math.min(Math.max(est.plotted, anchor.current.plotted + (now - anchor.current.wall) / 1000), est.frontier)
        : est.plotted;
      setTime(t);
      // keep going while the job runs; once the plotter is idle, only until the estimate caught up
      const caughtUp = state.current === "ready" && t >= est.frontier;
      if (t < active.sim.duration && RUNNING.has(state.current) && !caughtUp) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, starts]);

  return active ? time : undefined;
}
