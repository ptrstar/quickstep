"use client";

import { useState, useSyncExternalStore } from "react";
import type { MachineParams } from "@/core/quickstep";
import styles from "./PlotterPanel.module.css";
import { webSerialSupported } from "./transport";
import type { ActiveJob, Plotter } from "./usePlotter";

const JOG_STEPS = [0.5, 1, 5, 10, 50];

const STATE_TEXT: Record<string, string> = {
  disconnected: "not connected",
  connecting: "waiting for the board…",
  ready: "ready",
  streaming: "plotting",
  pausing: "pausing at the next pause point…",
  paused: "paused",
  stopping: "stopping…",
  finishing: "sent everything, plotter finishing",
  error: "error",
};

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s - m * 60)
    .toString()
    .padStart(2, "0")}`;
}

export function PlotterPanel({
  plotter,
  params,
  prepareJob,
  liveTime,
}: {
  plotter: Plotter;
  params: MachineParams;
  /** Builds the job for the program currently shown. */
  prepareJob: () => ActiveJob;
  liveTime?: number;
}) {
  const [jogStep, setJogStep] = useState(10);
  // false in the prerendered HTML, the real answer once in the browser (no hydration mismatch)
  const usbSupported = useSyncExternalStore(
    () => () => {},
    webSerialSupported,
    () => false,
  );
  const p = plotter;
  const ready = p.state === "ready";
  const running = ["streaming", "pausing", "paused", "stopping", "finishing"].includes(p.state);
  const progress = p.progress;

  const onKey = (e: React.KeyboardEvent) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (d[e.key] && ready) {
      e.preventDefault();
      p.jog(d[e.key][0] * jogStep, d[e.key][1] * jogStep, params);
    }
  };

  return (
    <section className={styles.panel}>
      <strong>Plotter</strong>
      <div className={styles.row}>
        {p.kind ? (
          <>
            <button type="button" onClick={() => p.disconnect()}>
              Disconnect
            </button>
            <button type="button" className={styles.danger} onClick={() => p.reset()} title="Reboot the board: stops at once">
              Reset board
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={!usbSupported} onClick={() => p.connect("usb")}>
              Connect USB
            </button>
            <button type="button" onClick={() => p.connect("sim")}>
              Simulated
            </button>
          </>
        )}
      </div>
      <span className={styles.state}>
        {p.kind === "sim" ? "simulated · " : ""}
        {STATE_TEXT[p.state]}
        {p.state === "ready" && ` · buffer ${p.capacity} B`}
      </span>
      {!usbSupported && !p.kind && <small>USB needs Chrome or Edge (Web Serial).</small>}
      {(p.error || p.message) && <span className={styles.error}>{p.error ?? p.message}</span>}

      {p.kind && (
        <>
          <div className={styles.jog} tabIndex={0} onKeyDown={onKey} title="Arrow keys jog while this pad is focused">
            <span />
            <button type="button" disabled={!ready} onClick={() => p.jog(0, -jogStep, params)}>
              ↑
            </button>
            <span />
            <button type="button" disabled={!ready} onClick={() => p.jog(-jogStep, 0, params)}>
              ←
            </button>
            <button type="button" disabled={!ready} onClick={() => p.togglePen()} title="Toggle pen">
              {p.penDown ? "pen ▲" : "pen ▼"}
            </button>
            <button type="button" disabled={!ready} onClick={() => p.jog(jogStep, 0, params)}>
              →
            </button>
            <span />
            <button type="button" disabled={!ready} onClick={() => p.jog(0, jogStep, params)}>
              ↓
            </button>
            <span />
          </div>
          <div className={styles.row}>
            {JOG_STEPS.map((s) => (
              <button key={s} type="button" className={s === jogStep ? styles.selected : undefined} onClick={() => setJogStep(s)}>
                {s}
              </button>
            ))}
            <small>mm</small>
          </div>
          <div className={styles.row}>
            <small>
              offset {(p.offset.x / params.steps_per_mm_x).toFixed(1)}, {(p.offset.y / params.steps_per_mm_y).toFixed(1)} mm
            </small>
            <button type="button" disabled={!ready} onClick={() => p.home(params)}>
              back
            </button>
            <button type="button" onClick={() => p.zero()}>
              zero
            </button>
            <button type="button" disabled={!ready} onClick={() => p.motorsOff()} title="Disable drivers (move by hand)">
              motors off
            </button>
          </div>

          <div className={styles.row}>
            <button type="button" disabled={!ready} onClick={() => p.start(prepareJob())}>
              Plot this
            </button>
            {running && (
              <>
                {p.state === "paused" || p.state === "pausing" ? (
                  <button type="button" onClick={() => p.resume()}>
                    Resume
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={p.state !== "streaming"} onClick={() => p.pause("pen-up")}>
                      Pause
                    </button>
                    <button type="button" disabled={p.state !== "streaming"} onClick={() => p.pause("now")} title="Pause at the very next point, pen may be down">
                      Pause now
                    </button>
                  </>
                )}
                <button type="button" disabled={p.state === "finishing" || p.state === "stopping"} onClick={() => p.stop()} title="Lift the pen, travel back to the start">
                  Stop
                </button>
              </>
            )}
          </div>

          {progress && p.active && (
            <div className={styles.progress}>
              <progress max={progress.total} value={progress.consumed} />
              <small>
                {progress.stopped ? "stopped · " : ""}
                {Math.round((100 * progress.consumed) / progress.total)}% of {progress.total} B
                {liveTime !== undefined &&
                  ` · ~${formatTime(liveTime)} / ${formatTime(p.active.sim.duration)}, ${formatTime(Math.max(0, p.active.sim.duration - liveTime))} left`}
              </small>
            </div>
          )}
        </>
      )}
    </section>
  );
}
