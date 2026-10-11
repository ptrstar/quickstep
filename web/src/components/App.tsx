"use client";

import { useEffect, useRef, useState } from "react";
import { parsePreset, PresetError, registry, toPreset } from "@/core/graph";
import styles from "./App.module.css";
import { DesignScreen } from "./design/DesignScreen";
import { downloadJson, useLibrary } from "./design/library";
import { useGraphEngine } from "./design/useGraphEngine";
import { useProject } from "./design/useProject";
import { usePlotter } from "./plotter/usePlotter";
import { Workbench } from "./Workbench";

const PLOTTER_TEXT: Record<string, string> = {
  disconnected: "Plotter not connected",
  connecting: "Connecting…",
  ready: "Plotter ready",
  streaming: "Plotting",
  pausing: "Pausing…",
  paused: "Paused",
  stopping: "Stopping…",
  finishing: "Finishing",
  error: "Plotter error",
};

/** The two steps: ① Design (graph → drawing) and ② Plot (simulate, stream). */
export function App() {
  const [step, setStep] = useState<"design" | "plot">("design");
  const project = useProject();
  const engine = useGraphEngine(project.doc);
  const library = useLibrary();
  const plotter = usePlotter();
  const [assetNames, setAssetNames] = useState(new Map<string, string>());
  const [message, setMessage] = useState<string>();
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(undefined), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const savePreset = () => {
    const name = window.prompt("Save the pipeline as preset:", project.name)?.trim();
    if (!name) return;
    library.savePreset(toPreset(registry, name, project.doc));
    project.rename(name);
    setMessage(`Saved preset "${name}"`);
  };

  const loadPreset = (name: string) => {
    const preset = library.presets.find((p) => p.name === name);
    if (!preset) return;
    if (!window.confirm(`Replace the current graph with "${name}"? (Export it first if you want to keep it.)`)) return;
    project.load(structuredClone(preset.graph), preset.name);
  };

  const importPreset = async (file: File) => {
    try {
      const { preset, warnings } = parsePreset(registry, JSON.parse(await file.text()));
      project.load(preset.graph, preset.name);
      setMessage(warnings.length ? `Imported "${preset.name}" (${warnings.join("; ")})` : `Imported "${preset.name}"`);
    } catch (e) {
      setMessage(e instanceof PresetError ? e.message : `Could not import ${file.name}`);
    }
  };

  const running = !["disconnected", "ready", "error", "connecting"].includes(plotter.state);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17c3-6 5 4 8-2s5 4 10-4" />
            <path d="M17 3l4 4-9 9H8v-4z" />
          </svg>
          QuickStep
        </div>
        <nav className={styles.steps} aria-label="Steps">
          <button type="button" aria-current={step === "design" ? "step" : undefined} onClick={() => setStep("design")}>
            ① Design
          </button>
          <span aria-hidden="true">›</span>
          <button type="button" aria-current={step === "plot" ? "step" : undefined} onClick={() => setStep("plot")}>
            ② Plot
          </button>
        </nav>
        <div className={styles.presets}>
          <label>
            <span className={styles.label}>Preset</span>
            <select value="" onChange={(e) => e.target.value && loadPreset(e.target.value)} aria-label="Load a preset">
              <option value="">{project.name}</option>
              {library.presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={savePreset}>
            Save
          </button>
          <button type="button" onClick={() => downloadJson(`${project.name}.quickstep.json`, toPreset(registry, project.name, project.doc))} title="Download the pipeline as a file">
            Export
          </button>
          <button type="button" onClick={() => importInput.current?.click()} title="Load a pipeline file">
            Import
          </button>
          <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importPreset(e.target.files[0])} />
        </div>
        <div className={styles.grow} />
        <span className={`${styles.pill} ${plotter.state === "ready" ? styles.pillOk : running ? styles.pillBusy : ""}`}>
          <span className={styles.pillDot} />
          {PLOTTER_TEXT[plotter.state]}
          {plotter.kind === "sim" && " (simulated)"}
        </span>
        {step === "design" ? (
          <button type="button" className="primary" onClick={() => setStep("plot")}>
            Continue to plot ›
          </button>
        ) : (
          <button type="button" onClick={() => setStep("design")}>
            ‹ Back to design
          </button>
        )}
      </header>

      {step === "design" ? (
        <DesignScreen
          project={project}
          engine={engine}
          library={library}
          assetNames={assetNames}
          onAssetLoaded={(key, name) => setAssetNames((m) => new Map(m).set(key, name))}
          onMessage={setMessage}
        />
      ) : (
        <Workbench plotter={plotter} drawing={engine.drawing} />
      )}

      {message && (
        <div className={styles.toast} role="status">
          {message}
        </div>
      )}
    </div>
  );
}
