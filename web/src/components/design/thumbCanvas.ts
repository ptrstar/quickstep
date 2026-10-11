import type { Stroke } from "@/core/geometry";
import type { Thumb } from "@/core/graph";

/**
 * Paints a thumbnail into a canvas of `width` × `height` CSS pixels: rasters scaled to fit,
 * paths in ink on white paper. `lineWidth` in CSS px (default hairline).
 */
export function drawThumb(canvas: HTMLCanvasElement, thumb: Thumb | undefined, width: number, height: number, lineWidth = 1) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!thumb) return;

  if (thumb.kind === "raster") {
    const src = new OffscreenCanvas(thumb.width, thumb.height);
    src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(thumb.data), thumb.width, thumb.height), 0, 0);
    const s = Math.min(width / thumb.width, height / thumb.height);
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(src, (width - thumb.width * s) / 2, (height - thumb.height * s) / 2, thumb.width * s, thumb.height * s);
    return;
  }

  const frame = thumb.kind === "drawing" ? thumb.paper : { width: thumb.width, height: thumb.height };
  const s = Math.min(width / frame.width, height / frame.height);
  const ox = (width - frame.width * s) / 2;
  const oy = (height - frame.height * s) / 2;
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(ox, oy, frame.width * s, frame.height * s);
  strokePaths(ctx, thumb.strokes, s, ox, oy, lineWidth);
}

export function strokePaths(ctx: CanvasRenderingContext2D, strokes: Stroke[], s: number, ox: number, oy: number, lineWidth: number, color = "#1b1d22") {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const st of strokes) {
    if (st.length === 1) continue; // dots below
    st.forEach((p, i) => (i === 0 ? ctx.moveTo(ox + p.x * s, oy + p.y * s) : ctx.lineTo(ox + p.x * s, oy + p.y * s)));
  }
  ctx.stroke();
  // a one-point stroke is a pen tap: draw it as a dot the width of the pen
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const st of strokes) {
    if (st.length !== 1) continue;
    const x = ox + st[0].x * s;
    const y = oy + st[0].y * s;
    const r = Math.max(0.6, lineWidth / 2);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, 2 * Math.PI);
  }
  ctx.fill();
}
