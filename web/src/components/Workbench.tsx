"use client";

import { useMemo, useState } from "react";
import { type CalibrationConfig, calibrationSheet, DEFAULT_CALIBRATION } from "@/core/calibration";
import { DEMOS } from "@/core/demo";
import { buildJob, prepareInstructions } from "@/core/link/job";
import type { PaperDrawing } from "@/core/graph";
import { compile, decodeAll, fromCArray, type Instruction } from "@/core/quickstep";
import { simulate } from "@/core/sim";
import { CalibrationPanel } from "./CalibrationPanel";
import { PlotterPanel } from "./plotter/PlotterPanel";
import { useLiveTime } from "./plotter/useLiveTime";
import type { Plotter } from "./plotter/usePlotter";
import { ParamsPanel, useMachineParams } from "./sim/ParamsPanel";
import { Simulator } from "./sim/Simulator";
import styles from "./Workbench.module.css";

type Program =
  | { name: "your drawing"; source: "pipeline" }
  | { name: string; source: "file"; instructions: Instruction[] }
  | { name: string; source: "demo" }
  | { name: "calibration"; source: "calibration" };

/** v1 programs were C-array text ("0x81,0x13,..."); v2 programs are raw bytes. */
async function readProgram(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 16)).trimStart();
  return head.startsWith("0x") ? fromCArray(new TextDecoder().decode(bytes)) : bytes;
}

/**
 * ② Plot: simulate a job and stream it to the plotter. The job is the drawing from ① Design by
 * default; demos, the calibration sheet and QUICKSTEP files are the other sources.
 */
export function Workbench({ plotter, drawing }: { plotter: Plotter; drawing?: PaperDrawing }) {
  const machine = useMachineParams();
  const params = machine.params;
  const [program, setProgramState] = useState<Program>(drawing ? { name: "your drawing", source: "pipeline" } : { name: "star", source: "demo" });
  const [calibration, setCalibration] = useState<CalibrationConfig>(DEFAULT_CALIBRATION);
  const [useProgramParams, setUseProgramParams] = useState(false);
  const [error, setError] = useState<string>();
  const liveTime = useLiveTime(plotter);
  const setProgram = (p: Program) => {
    plotter.dismiss();
    setProgramState(p);
  };

  const sheet = useMemo(() => calibrationSheet(calibration, params), [calibration, params]);
  const instructions = useMemo(() => {
    if (program.source === "file") return program.instructions;
    if (program.source === "pipeline") return compile(drawing?.strokes ?? [], params, { header: false });
    if (program.source === "calibration") return sheet.instructions;
    // Demos are compiled with the current calibration, so steps/mm changes apply to them too.
    return compile(DEMOS[program.name](), params, { header: false });
  }, [program, params, sheet, drawing]);

  // The calibration sheet sets its own parameters per cell, so it always keeps them.
  const programParams = instructions.filter((i) => i.op === "set_param").length;
  const keepProgramParams = program.source === "calibration" || (useProgramParams && programParams > 0);

  // What is simulated is exactly what "Plot this" sends.
  const current = useMemo(() => {
    const job = buildJob(prepareInstructions(instructions, params, keepProgramParams));
    return { job, sim: simulate(job.instructions, params) };
  }, [instructions, params, keepProgramParams]);

  // While a job runs, show that job (parameters may have been edited since).
  const shown = liveTime !== undefined && plotter.active ? plotter.active : current;

  const open = async (file: File) => {
    try {
      setProgram({ name: file.name, source: "file", instructions: decodeAll(await readProgram(file)) });
      setError(undefined);
    } catch (e) {
      setError(`${file.name}: ${e}`);
    }
  };

  return (
    <main className={styles.workbench}>
      <aside className={styles.sidebar}>
        <PlotterPanel plotter={plotter} params={params} prepareJob={() => current} liveTime={liveTime} />
        <section className={styles.loader}>
          <strong>Program</strong>
          <input type="file" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
          <div className={styles.demos}>
            <button type="button" disabled={!drawing} onClick={() => setProgram({ name: "your drawing", source: "pipeline" })}>
              your drawing
            </button>
            {Object.keys(DEMOS).map((name) => (
              <button key={name} type="button" onClick={() => setProgram({ name, source: "demo" })}>
                {name}
              </button>
            ))}
            <button type="button" onClick={() => setProgram({ name: "calibration", source: "calibration" })}>
              calibration
            </button>
          </div>
          <span>
            showing: {program.name} · {current.job.bytes.length} bytes
          </span>
          {programParams > 0 && program.source === "file" && (
            <label>
              <input type="checkbox" checked={useProgramParams} onChange={(e) => setUseProgramParams(e.target.checked)} /> use the
              program&apos;s {programParams} parameters instead of the panel
            </label>
          )}
          {error && <span className={styles.error}>{error}</span>}
        </section>
        {program.source === "calibration" && <CalibrationPanel config={calibration} onChange={setCalibration} cells={sheet.cells} />}
        <ParamsPanel key={machine.revision} params={params} onChange={machine.update} onReset={machine.reset} />
      </aside>
      <Simulator sim={shown.sim} liveTime={liveTime} />
    </main>
  );
}
