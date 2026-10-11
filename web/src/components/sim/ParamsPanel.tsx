"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PARAMS, type MachineParams, type ParamName } from "@/core/quickstep";
import styles from "./Simulator.module.css";

const STORAGE_KEY = "quickstep.machineParams";

type Field = { name: ParamName; label: string; unit: string; min: number; step: number };

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Speed",
    fields: [
      { name: "draw_speed", label: "draw", unit: "mm/s", min: 0.1, step: 1 },
      { name: "travel_speed", label: "travel", unit: "mm/s", min: 0.1, step: 1 },
      { name: "max_speed_x", label: "max x", unit: "mm/s", min: 0.1, step: 1 },
      { name: "max_speed_y", label: "max y", unit: "mm/s", min: 0.1, step: 1 },
    ],
  },
  {
    title: "Acceleration",
    fields: [
      { name: "accel_x", label: "accel x", unit: "mm/s²", min: 1, step: 10 },
      { name: "accel_y", label: "accel y", unit: "mm/s²", min: 1, step: 10 },
      { name: "junction_deviation", label: "corner δ", unit: "mm", min: 0, step: 0.01 },
    ],
  },
  {
    title: "Pen lift",
    fields: [
      { name: "pen_lift_steps", label: "lift", unit: "steps", min: 0, step: 1 },
      { name: "pen_speed", label: "speed", unit: "steps/s", min: 1, step: 10 },
      { name: "pen_accel", label: "accel", unit: "steps/s²", min: 1, step: 100 },
      { name: "pen_settle_ms", label: "settle", unit: "ms", min: 0, step: 10 },
    ],
  },
  {
    title: "Calibration",
    fields: [
      { name: "steps_per_mm_x", label: "steps/mm x", unit: "", min: 0.01, step: 0.01 },
      { name: "steps_per_mm_y", label: "steps/mm y", unit: "", min: 0.01, step: 0.01 },
      { name: "microsteps_x", label: "µsteps x", unit: "", min: 1, step: 1 },
      { name: "microsteps_y", label: "µsteps y", unit: "", min: 1, step: 1 },
      { name: "microsteps_z", label: "µsteps z", unit: "", min: 1, step: 1 },
    ],
  },
];

/**
 * Machine parameters, remembered in this browser. Falls back to defaults if storage is unavailable.
 * `revision` changes when the parameters are replaced as a whole (loaded, reset), so inputs can remount.
 */
export function useMachineParams() {
  const [state, setState] = useState({ params: DEFAULT_PARAMS, revision: 0 });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists on the client
      if (saved) setState((s) => ({ params: { ...DEFAULT_PARAMS, ...saved }, revision: s.revision + 1 }));
    } catch {
      // no storage: keep defaults
    }
  }, []);

  const save = (params: MachineParams, replace: boolean) => {
    setState((s) => ({ params, revision: replace ? s.revision + 1 : s.revision }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {
      // no storage: still works for this session
    }
  };
  return {
    params: state.params,
    revision: state.revision,
    update: (params: MachineParams) => save(params, false),
    reset: () => save(DEFAULT_PARAMS, true),
  };
}

export function ParamsPanel({
  params,
  onChange,
  onReset,
}: {
  params: MachineParams;
  onChange: (p: MachineParams) => void;
  onReset: () => void;
}) {
  return (
    <div className={styles.params}>
      {GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend>{g.title}</legend>
          {g.fields.map((f) => (
            <label key={f.name}>
              <span>{f.label}</span>
              <input
                type="number"
                min={f.min}
                step={f.step}
                defaultValue={+params[f.name].toFixed(4)}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isFinite(v) && v >= f.min) onChange({ ...params, [f.name]: v });
                }}
              />
              <small>{f.unit}</small>
            </label>
          ))}
        </fieldset>
      ))}
      <button type="button" onClick={onReset}>
        Reset to defaults
      </button>
    </div>
  );
}
