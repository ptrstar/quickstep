"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseSvgFont } from "@/core/text/font";
import { CHARSETS, composedGlyphs, fromSvgFont, type HandFont, progress, toSvgFont } from "@/core/text/handwriting";
import { layoutText } from "@/core/text/layout";
import { strokePaths } from "../design/thumbCanvas";
import styles from "./FontStudio.module.css";
import { WritingPad } from "./WritingPad";

const ALL = CHARSETS.map((c) => c.chars).join("");

/**
 * Capture a single-line font from your handwriting: one character at a time on a pad with guide
 * lines, with a live preview. "Use in QuickStep" makes it available in every font picker.
 */
export function FontStudio({
  font,
  onChange,
  onUse,
  onClose,
}: {
  font: HandFont;
  onChange: (f: HandFont) => void;
  onUse: (svg: string) => void;
  onClose: () => void;
}) {
  const [char, setChar] = useState("a");
  const [sample, setSample] = useState("Frohe Weihnachten! Liebe Grüsse");
  const [padScale, setPadScale] = useState(1);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("quickstep.padScale"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists on the client
      if (saved >= 0.15 && saved <= 1) setPadScale(saved);
    } catch {
      // no storage
    }
  }, []);
  const changePadScale = (v: number) => {
    setPadScale(v);
    try {
      localStorage.setItem("quickstep.padScale", String(v));
    } catch {
      // no storage
    }
  };
  const importer = useRef<HTMLInputElement>(null);
  const composed = useMemo(() => composedGlyphs(font), [font]);
  const strokes = font.glyphs[char] ?? [];
  const index = [...ALL].indexOf(char);

  const setStrokes = (s: HandFont["glyphs"][string]) => {
    const glyphs = { ...font.glyphs, [char]: s };
    if (s.length === 0) delete glyphs[char];
    onChange({ ...font, glyphs });
  };
  const go = (step: number) => setChar([...ALL][([...ALL].length + index + step) % [...ALL].length]);

  // Enter / → next, ← previous, Backspace undo, Escape close (not while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Enter" || e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Backspace") setStrokes(strokes.slice(0, -1));
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const svg = useMemo(() => toSvgFont(font), [font]);

  // live preview of the sample text
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const width = c.clientWidth;
    const height = 140;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fbfbf8";
    ctx.fillRect(0, 0, width, height);
    try {
      const f = parseSvgFont(svg);
      const l = layoutText(sample, f, { size: 1, lineHeight: 1.3, align: "left", width: (width - 24) / 34 });
      strokePaths(ctx, l.strokes, 34, 12, 12, 1.6);
    } catch {
      // nothing drawn yet
    }
  }, [svg, sample]);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Handwriting font studio">
      <div className={styles.head}>
        <strong>Handwriting font</strong>
        <input aria-label="Font name" value={font.name} onChange={(e) => onChange({ ...font, name: e.target.value })} />
        <span className={styles.muted}>
          {progress(font, ALL).done} / {[...ALL].length} characters
        </span>
        <div className={styles.grow} />
        <button type="button" className="primary" onClick={() => onUse(svg)}>
          Use in QuickStep
        </button>
        <button type="button" onClick={() => download(svg, `${font.name || "handwriting"}.svg`)}>
          Download SVG font
        </button>
        <button type="button" onClick={() => importer.current?.click()}>
          Import…
        </button>
        <input
          ref={importer}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) onChange(fromSvgFont(await file.text()));
          }}
        />
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className={styles.body}>
        <nav className={styles.chars} aria-label="Characters">
          {CHARSETS.map((set) => {
            const p = progress(font, set.chars);
            return (
              <section key={set.name}>
                <h3>
                  {set.name} <small>{p.done}/{p.total}</small>
                </h3>
                <div className={styles.grid}>
                  {[...set.chars].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={c === char}
                      className={font.glyphs[c]?.length ? styles.drawn : composed[c] ? styles.composed : ""}
                      onClick={() => setChar(c)}
                      title={font.glyphs[c]?.length ? "drawn" : composed[c] ? "composed from letter + mark" : "not drawn yet"}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </nav>

        <section className={styles.writing}>
          <div className={styles.bar}>
            <span className={styles.big}>{char}</span>
            <span className={styles.muted}>Write it once, at the size of the guides. Enter: next · ←: back · Backspace: undo stroke</span>
            <div className={styles.grow} />
            <button type="button" onClick={() => setStrokes(strokes.slice(0, -1))} disabled={!strokes.length}>
              Undo stroke
            </button>
            <button type="button" onClick={() => setStrokes([])} disabled={!strokes.length}>
              Clear
            </button>
            <button type="button" onClick={() => go(-1)}>
              ‹
            </button>
            <button type="button" className="primary" onClick={() => go(1)}>
              Next ›
            </button>
          </div>
          <label className={styles.scale}>
            Pad size
            <input type="range" min={0.15} max={1} step={0.01} value={padScale} onChange={(e) => changePadScale(e.target.valueAsNumber)} />
            <span className={styles.muted}>{Math.round(padScale * 100)} % · write at your natural size; the font comes out the same</span>
          </label>
          <WritingPad char={char} strokes={strokes} onStroke={(s) => setStrokes([...strokes, s])} scale={padScale} />
        </section>

        <aside className={styles.side}>
          <label className={styles.field}>
            Preview text
            <input type="text" value={sample} onChange={(e) => setSample(e.target.value)} />
          </label>
          <canvas ref={preview} className={styles.preview} style={{ height: 140 }} aria-label="Preview of the font" />
          <label className={styles.field}>
            Letter spacing <b>{font.spacing}</b>
            <input type="range" min={0} max={250} value={font.spacing} onChange={(e) => onChange({ ...font, spacing: e.target.valueAsNumber })} />
          </label>
          <p className={styles.muted}>
            Accented letters (ä ö ü é è à …) are composed from the letter and the mark you draw once under “Accent marks”. Draw one yourself to
            replace the composed one. Your font is saved in this browser; download it to keep a copy.
          </p>
        </aside>
      </div>
    </div>
  );
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
