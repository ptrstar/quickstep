"use client";

import { useMemo, useState } from "react";
import { type CalibrationConfig, calibrationSheet, DEFAULT_CALIBRATION } from "@/core/calibration";
import { DEMOS } from "@/core/demo";
import type { PaperDrawing } from "@/core/graph";
import { buildJob, prepareInstructions } from "@/core/link/job";
import { compile, decodeAll, fromCArray, type Instruction } from "@/core/quickstep";
import { simulate, stats } from "@/core/sim";
import { CalibrationPanel } from "../CalibrationPanel";
import { useLiveTime } from "../plotter/useLiveTime";
import type { Plotter } from "../plotter/usePlotter";
import { ParamsPanel, useMachineParams } from "../sim/ParamsPanel";
import styles from "./PlotScreen.module.css";
import { PlotView } from "./PlotView";
import { EstimateCard, JobCard } from "./Sidebar";
import { usePlayback } from "./usePlayback";

type Source =
  | { kind: "pipeline" }
  | { kind: "demo"; name: string }
  | { kind: "calibration" }
  | { kind: "file"; name: string; instructions: Instruction[] };

/** v1 programs were C-array text ("0x81,0x13,..."); v2 programs are raw bytes. */
async function readProgram(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 16)).trimStart();
  return head.startsWith("0x") ? fromCArray(new TextDecoder().decode(bytes)) : bytes;
}

/**
 * ② Plot: review the job (estimate, speed, simulation), set up the paper, then simulate or plot.
 * While plotting, the view follows the plotter and the job controls take over.
 */
export function PlotScreen({
  plotter,
  drawing,
  name,
  onBackToDesign,
}: {
  plotter: Plotter;
  drawing?: PaperDrawing;
  /** Project name, for the downloaded file. */
  name: string;
  onBackToDesign: () => void;
}) {
  const machine = useMachineParams();
  const params = machine.params;
  const [source, setSourceState] = useState<Source>({ kind: "pipeline" });
  const [calibration, setCalibration] = useState<CalibrationConfig>(DEFAULT_CALIBRATION);
  const [error, setError] = useState<string>();
  const liveTime = useLiveTime(plotter);

  const setSource = (s: Source) => {
    plotter.dismiss();
    setSourceState(s);
  };

  const sheet = useMemo(() => calibrationSheet(calibration, params), [calibration, params]);
  const { instructions, paper } = useMemo(() => {
    switch (source.kind) {
      case "pipeline":
        return { instructions: compile(drawing?.strokes ?? [], params, { header: false }), paper: drawing?.paper };
      case "calibration":
        return { instructions: sheet.instructions, paper: undefined };
      case "file":
        return { instructions: source.instructions, paper: undefined };
      default:
        return { instructions: compile(DEMOS[source.name](), params, { header: false }), paper: undefined };
    }
  }, [source, drawing, params, sheet]);

  // The calibration sheet and files may set their own parameters; the pipeline uses the panel's.
  const keepProgramParams = source.kind === "calibration";

  // What is simulated is exactly what "Start plotting" sends.
  const current = useMemo(() => {
    const job = buildJob(prepareInstructions(instructions, params, keepProgramParams));
    return { job, sim: simulate(job.instructions, params), paper };
  }, [instructions, params, keepProgramParams, paper]);

  // While a job runs, show that job (the parameters may have been edited since).
  const running = liveTime !== undefined && !!plotter.active;
  const shown = running ? plotter.active! : current;
  const summary = useMemo(() => stats(shown.sim), [shown.sim]);
  const playback = usePlayback(shown.sim.duration);

  const open = async (file: File) => {
    try {
      setSource({ kind: "file", name: file.name, instructions: decodeAll(await readProgram(file)) });
      setError(undefined);
    } catch (e) {
      setError(`${file.name}: ${e}`);
    }
  };

  const empty = source.kind === "pipeline" && !drawing;

  return (
    <div className={styles.screen}>
      <div className={styles.main}>
        {empty ? (
          <section className={styles.empty}>
            <p>Nothing to plot yet: wire a drawing into the Output knob in ① Design.</p>
            <button type="button" onClick={onBackToDesign}>
              ‹ Back to design
            </button>
          </section>
        ) : (
          <PlotView sim={shown.sim} paper={shown.paper} playback={playback} liveTime={running ? liveTime : undefined} title={running ? "Live" : "Simulation"} />
        )}
      </div>

      <aside className={styles.side}>
        <EstimateCard stats={summary} job={shown.job} liveTime={liveTime} running={running} name={source.kind === "pipeline" ? name : source.kind === "demo" ? source.name : source.kind === "file" ? source.name.replace(/\.\w+$/, "") : "calibration"} />
        <JobCard
          plotter={plotter}
          params={params}
          playing={playback.playing}
          onSimulate={() => (playback.playing ? playback.pause() : playback.play())}
          onPlot={() => {
            playback.pause();
            plotter.start(current);
          }}
          onBackToDesign={onBackToDesign}
        />

        <details className={styles.fold} open>
          <summary>Machine speeds</summary>
          <p className={styles.muted}>Changes re-simulate at once and apply to the next job you start.</p>
          <ParamsPanel key={machine.revision} params={params} onChange={machine.update} onReset={machine.reset} />
        </details>

        <details className={styles.fold}>
          <summary>
            Job source: <b>{source.kind === "pipeline" ? "your drawing" : source.kind === "demo" ? source.name : source.kind === "file" ? source.name : "calibration sheet"}</b>
          </summary>
          <div className={styles.sources}>
            <button type="button" aria-pressed={source.kind === "pipeline"} onClick={() => setSource({ kind: "pipeline" })}>
              your drawing
            </button>
            {Object.keys(DEMOS).map((name) => (
              <button key={name} type="button" aria-pressed={source.kind === "demo" && source.name === name} onClick={() => setSource({ kind: "demo", name })}>
                {name}
              </button>
            ))}
            <button type="button" aria-pressed={source.kind === "calibration"} onClick={() => setSource({ kind: "calibration" })}>
              calibration sheet
            </button>
            <label className={styles.file}>
              QUICKSTEP file…
              <input type="file" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
            </label>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          {source.kind === "calibration" && <CalibrationPanel config={calibration} onChange={setCalibration} cells={sheet.cells} />}
        </details>
      </aside>
    </div>
  );
}
