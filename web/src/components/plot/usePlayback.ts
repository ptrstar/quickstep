"use client";

import { useEffect, useRef, useState } from "react";

/** Simulation playback: a clock that runs at `rate` × real time up to `duration`. */
export function usePlayback(duration: number) {
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(10);
  const timeRef = useRef(0);

  const setTime = (t: number) => {
    timeRef.current = t;
    setTimeState(t);
  };

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(timeRef.current + ((now - last) / 1000) * rate, duration);
      last = now;
      timeRef.current = next;
      setTimeState(next);
      if (next >= duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, duration]);

  return {
    time: Math.min(time, duration),
    setTime,
    playing,
    rate,
    setRate,
    play() {
      if (timeRef.current >= duration) setTime(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
  };
}

export type Playback = ReturnType<typeof usePlayback>;
