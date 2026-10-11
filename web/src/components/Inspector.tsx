"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PARAMS, decodeAll, fromCArray, type Instruction, type Trace, trace } from "@/core/quickstep";

type Loaded = { name: string; bytes: number; instructions: Instruction[]; trace: Trace } | { name: string; error: string };

/** v1 programs were C-array text ("0x81,0x13,..."); v2 programs are raw bytes. */
async function readProgram(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 16)).trimStart();
  return head.startsWith("0x") ? fromCArray(new TextDecoder().decode(bytes)) : bytes;
}

export function Inspector() {
  const [loaded, setLoaded] = useState<Loaded>();
  const canvas = useRef<HTMLCanvasElement>(null);

  const open = async (file: File) => {
    try {
      const bytes = await readProgram(file);
      const instructions = decodeAll(bytes);
      setLoaded({ name: file.name, bytes: bytes.length, instructions, trace: trace(instructions) });
    } catch (e) {
      setLoaded({ name: file.name, error: String(e) });
    }
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !loaded || "error" in loaded) return;
    drawPreview(c, loaded.trace);
  }, [loaded]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <input type="file" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
      {loaded && "error" in loaded && <p style={{ color: "crimson" }}>{loaded.error}</p>}
      {loaded && !("error" in loaded) && (
        <>
          <p>
            {loaded.name}: {loaded.bytes} bytes, {loaded.instructions.length} instructions, {loaded.trace.moves} moves,{" "}
            {loaded.trace.strokes.length} strokes, ends at ({loaded.trace.end.x}, {loaded.trace.end.y}) with pen{" "}
            {loaded.trace.penDown ? "down" : "up"}
          </p>
          <canvas ref={canvas} width={800} height={800} style={{ width: "100%", maxWidth: 800, border: "1px solid #8884" }} />
        </>
      )}
    </section>
  );
}

function drawPreview(c: HTMLCanvasElement, t: Trace) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  // steps → mm with the default calibration, so the aspect ratio is physical
  const mm = t.strokes.map((s) =>
    s.map((p) => ({ x: p.x / DEFAULT_PARAMS.steps_per_mm_x, y: p.y / DEFAULT_PARAMS.steps_per_mm_y })),
  );
  const all = mm.flat();
  if (all.length === 0) return;
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const scale = (0.95 * Math.min(c.width, c.height)) / Math.max(maxX - minX, maxY - minY, 1e-9);
  const ox = (c.width - (maxX - minX) * scale) / 2;
  const oy = (c.height - (maxY - minY) * scale) / 2;

  ctx.strokeStyle = getComputedStyle(c).color;
  ctx.lineWidth = 1;
  for (const s of mm) {
    ctx.beginPath();
    s.forEach((p, i) => {
      const x = ox + (p.x - minX) * scale;
      const y = oy + (p.y - minY) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
