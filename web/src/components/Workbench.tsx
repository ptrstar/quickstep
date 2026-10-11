"use client";

import { useMemo, useState } from "react";
import { DEMOS } from "@/core/demo";
import { compile, decodeAll, fromCArray, type Instruction } from "@/core/quickstep";
import { ParamsPanel, useMachineParams } from "./sim/ParamsPanel";
import { Simulator } from "./sim/Simulator";
import styles from "./Workbench.module.css";

type Program = { name: string; source: "file"; instructions: Instruction[] } | { name: string; source: "demo" };

/** v1 programs were C-array text ("0x81,0x13,..."); v2 programs are raw bytes. */
async function readProgram(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 16)).trimStart();
  return head.startsWith("0x") ? fromCArray(new TextDecoder().decode(bytes)) : bytes;
}

export function Workbench() {
  const machine = useMachineParams();
  const [program, setProgram] = useState<Program>({ name: "star", source: "demo" });
  const [error, setError] = useState<string>();

  // Demos are compiled with the current calibration, so steps/mm changes apply to them too.
  const instructions = useMemo(
    () =>
      program.source === "file" ? program.instructions : compile(DEMOS[program.name](), machine.params, { header: false }),
    [program, machine.params],
  );

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
        <h1>QuickStep</h1>
        <section className={styles.loader}>
          <strong>Program</strong>
          <input type="file" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
          <div className={styles.demos}>
            {Object.keys(DEMOS).map((name) => (
              <button key={name} type="button" onClick={() => setProgram({ name, source: "demo" })}>
                {name}
              </button>
            ))}
          </div>
          <span>showing: {program.name}</span>
          {error && <span className={styles.error}>{error}</span>}
        </section>
        <ParamsPanel key={machine.revision} params={machine.params} onChange={machine.update} onReset={machine.reset} />
      </aside>
      <Simulator instructions={instructions} params={machine.params} />
    </main>
  );
}
