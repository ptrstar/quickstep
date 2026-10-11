"use client";

import { type CalibrationCell, type CalibrationConfig, parseList } from "@/core/calibration";
import styles from "./CalibrationPanel.module.css";

/** Settings of the calibration sheet, and the legend to read the plotted sheet with. */
export function CalibrationPanel({
  config,
  onChange,
  cells,
}: {
  config: CalibrationConfig;
  onChange: (c: CalibrationConfig) => void;
  cells: CalibrationCell[];
}) {
  const number = (key: "yRatio" | "deviation" | "cell", label: string, step: number) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        defaultValue={config[key]}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v) && v > 0) onChange({ ...config, [key]: v });
        }}
      />
    </label>
  );
  const list = (key: "speeds" | "accels", label: string) => (
    <label>
      <span>{label}</span>
      <input
        defaultValue={config[key].join(", ")}
        onChange={(e) => {
          const values = parseList(e.target.value);
          if (values.length > 0) onChange({ ...config, [key]: values });
        }}
      />
    </label>
  );

  return (
    <section className={styles.calibration}>
      <strong>Calibration sheet</strong>
      <small>
        Columns: draw speed. Rows: acceleration (y = x · ratio). The frame is drawn first and last: if the two frames do not line up,
        an axis lost steps or the paper slipped.
      </small>
      {list("speeds", "speeds mm/s")}
      {list("accels", "accel x mm/s²")}
      {number("yRatio", "y ratio", 0.1)}
      {number("deviation", "corner δ mm", 0.01)}
      {number("cell", "cell mm", 1)}
      <table>
        <thead>
          <tr>
            <th>accel x / y</th>
            {config.speeds.map((s) => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.accels.map((a, row) => (
            <tr key={a}>
              <th>
                {a} / {Math.round(a * config.yRatio)}
              </th>
              {config.speeds.map((s, col) => (
                <td key={s}>{cells.find((c) => c.row === row && c.col === col) ? `${String.fromCharCode(65 + row)}${col + 1}` : ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
