"use client";

import { useState, useSyncExternalStore } from "react";
import type { Job } from "@/core/link/job";
import type { MachineParams } from "@/core/quickstep";
import type { SimStats } from "@/core/sim";
import { webSerialSupported } from "../plotter/transport";
import type { Plotter } from "../plotter/usePlotter";
import styles from "./Sidebar.module.css";

const mmss = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s - m * 60)
    .toString()
    .padStart(2, "0")}`;
};

/** Total time split into drawing, travel and pen, with the figures that matter; details folded away. */
export function EstimateCard({ stats: s, job, liveTime, running }: { stats: SimStats; job: Job; liveTime?: number; running: boolean }) {
  const parts = [
    { label: "drawing", value: s.drawTime, color: "var(--t-lines)" },
    { label: "travel", value: s.travelTime, color: "var(--t-image)" },
    { label: "pen", value: s.penTime + s.waitTime, color: "var(--t-gray)" },
  ];
  const total = Math.max(s.duration, 1e-9);
  const left = liveTime !== undefined ? Math.max(0, s.duration - liveTime) : undefined;

  return (
    <section className={styles.card}>
      {running && left !== undefined ? (
        <>
          <div className={styles.big}>
            <span>{mmss(left)}</span>
            <small>left</small>
          </div>
          <progress max={total} value={liveTime} />
          <div className={styles.muted}>
            {mmss(liveTime ?? 0)} of {mmss(s.duration)} · estimated from what the plotter has taken
          </div>
        </>
      ) : (
        <>
          <div className={styles.big}>
            <span>{mmss(s.duration)}</span>
            <small>estimated</small>
          </div>
          <div className={styles.bar} aria-hidden="true">
            {parts.map((p) => (
              <span key={p.label} style={{ width: `${(100 * p.value) / total}%`, background: p.color }} />
            ))}
          </div>
          <div className={styles.legend}>
            {parts.map((p) => (
              <span key={p.label}>
                <i style={{ background: p.color }} />
                {p.label} {mmss(p.value)}
              </span>
            ))}
          </div>
        </>
      )}
      <div className={styles.chips}>
        <div>
          <b>{(s.drawDistance / 1000).toFixed(2)} m</b>
          <small>ink</small>
        </div>
        <div>
          <b>{s.drawSpeed.toFixed(0)}</b>
          <small>mm/s avg</small>
        </div>
        <div>
          <b>{(job.bytes.length / 1024).toFixed(1)} KB</b>
          <small>QUICKSTEP</small>
        </div>
      </div>
      <details className={styles.details}>
        <summary>Motion details</summary>
        <div>
          <span>peak {s.peakSpeed.toFixed(0)} mm/s</span>
          <span>{s.penToggles / 2} strokes</span>
          <span>{s.moves.toLocaleString("en")} moves</span>
          <span>travel {(s.travelDistance / 1000).toFixed(2)} m</span>
          <span>step x {(s.maxStepRateX / 1000).toFixed(1)} kHz</span>
          <span>step y {(s.maxStepRateY / 1000).toFixed(1)} kHz</span>
        </div>
      </details>
    </section>
  );
}

const JOG_STEPS = [0.5, 1, 5, 10, 50];

/** Simulate or plot; while plotting: pause, resume, stop; and the plotter connection with jogging. */
export function JobCard({
  plotter,
  params,
  playing,
  onSimulate,
  onPlot,
  onBackToDesign,
}: {
  plotter: Plotter;
  params: MachineParams;
  playing: boolean;
  onSimulate: () => void;
  onPlot: () => void;
  onBackToDesign: () => void;
}) {
  const [jogStep, setJogStep] = useState(10);
  const usb = useSyncExternalStore(
    () => () => {},
    webSerialSupported,
    () => false,
  );
  const p = plotter;
  const ready = p.state === "ready";
  const running = ["streaming", "pausing", "paused", "stopping", "finishing"].includes(p.state);
  const progress = p.progress;
  const finished = !!progress && !running && p.active && (progress.consumed >= progress.total || progress.stopped);

  const jogKey = (e: React.KeyboardEvent) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (d[e.key] && ready) {
      e.preventDefault();
      p.jog(d[e.key][0] * jogStep, d[e.key][1] * jogStep, params);
    }
  };

  return (
    <>
      <section className={styles.card}>
        {running ? (
          <div className={styles.actions}>
            {p.state === "paused" || p.state === "pausing" ? (
              <button type="button" className="primary" onClick={() => p.resume()}>
                Resume
              </button>
            ) : (
              <button type="button" className="primary" disabled={p.state !== "streaming"} onClick={() => p.pause("pen-up")}>
                Pause at pen-up
              </button>
            )}
            <button type="button" disabled={p.state !== "streaming"} onClick={() => p.pause("now")}>
              Pause now
            </button>
            <button type="button" disabled={p.state === "finishing" || p.state === "stopping"} onClick={() => p.stop()}>
              Stop &amp; go home
            </button>
            <button type="button" className="danger" onClick={() => p.reset()} title="Reboot the board: stops at once">
              Reset board
            </button>
            <p className={styles.muted}>
              {p.state === "pausing"
                ? "Pausing: the buffered path runs out, then it holds with the pen up."
                : p.state === "paused"
                  ? "Paused. Resume continues exactly where it stopped."
                  : p.state === "finishing"
                    ? "Everything is sent; the plotter is drawing the last moves."
                    : "Pause lets the buffered path run out, then holds with the pen up. Reset stops at once."}
            </p>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" onClick={onSimulate}>
              {playing ? "❚❚ Pause simulation" : "▶ Simulate"}
            </button>
            <button type="button" className="primary" disabled={!ready} onClick={onPlot} title={ready ? "Stream this job to the plotter" : "Connect the plotter first"}>
              Start plotting
            </button>
            {finished && (
              <p className={styles.muted}>
                {progress.stopped ? "Stopped: the pen went home." : "Done."}{" "}
                <button type="button" className={styles.link} onClick={onBackToDesign}>
                  Back to design
                </button>
              </p>
            )}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.head}>
          <strong>Plotter</strong>
          <span className={styles.muted}>
            {p.kind === "sim" ? "simulated · " : p.kind === "usb" ? "USB · " : ""}
            {p.state === "disconnected" ? "not connected" : p.state}
            {ready && ` · buffer ${p.capacity} B`}
          </span>
        </div>
        {(p.error || p.message) && <span className={styles.error}>{p.error ?? p.message}</span>}
        <div className={styles.row}>
          {p.kind ? (
            <button type="button" onClick={() => p.disconnect()} disabled={running}>
              Disconnect
            </button>
          ) : (
            <>
              <button type="button" disabled={!usb} onClick={() => p.connect("usb")} title={usb ? "" : "Needs Chrome or Edge (Web Serial)"}>
                Connect USB
              </button>
              <button type="button" onClick={() => p.connect("sim")}>
                Simulated plotter
              </button>
            </>
          )}
        </div>
        {p.kind && (
          <div className={`${styles.setup} ${ready ? "" : styles.disabled}`}>
            <span className={styles.muted}>Move the pen to the paper&apos;s top-left corner, then zero.</span>
            <div className={styles.jogRow}>
              <div className={styles.jog} tabIndex={0} onKeyDown={jogKey} title="Arrow keys jog while this pad is focused">
                <span />
                <button type="button" aria-label="Jog up" disabled={!ready} onClick={() => p.jog(0, -jogStep, params)}>
                  ↑
                </button>
                <span />
                <button type="button" aria-label="Jog left" disabled={!ready} onClick={() => p.jog(-jogStep, 0, params)}>
                  ←
                </button>
                <button type="button" aria-label="Toggle pen" disabled={!ready} onClick={() => p.togglePen()}>
                  {p.penDown ? "▲" : "▼"}
                </button>
                <button type="button" aria-label="Jog right" disabled={!ready} onClick={() => p.jog(jogStep, 0, params)}>
                  →
                </button>
                <span />
                <button type="button" aria-label="Jog down" disabled={!ready} onClick={() => p.jog(0, jogStep, params)}>
                  ↓
                </button>
                <span />
              </div>
              <div className={styles.jogSide}>
                <label>
                  step
                  <select value={jogStep} onChange={(e) => setJogStep(Number(e.target.value))}>
                    {JOG_STEPS.map((s) => (
                      <option key={s} value={s}>
                        {s} mm
                      </option>
                    ))}
                  </select>
                </label>
                <span className={styles.mono}>
                  {(p.offset.x / params.steps_per_mm_x).toFixed(1)}, {(p.offset.y / params.steps_per_mm_y).toFixed(1)} mm
                </span>
                <div className={styles.row}>
                  <button type="button" disabled={!ready} onClick={() => p.zero()}>
                    Zero here
                  </button>
                  <button type="button" disabled={!ready} onClick={() => p.home(params)}>
                    Back
                  </button>
                </div>
                <button type="button" disabled={!ready} onClick={() => p.motorsOff()} title="Disable the drivers to move by hand">
                  Motors off
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

