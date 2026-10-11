import type { Point, Stroke } from "../geometry";

/**
 * SVG path data → polylines. Curves are cut into straight pieces no further than about
 * `tolerance` from the true curve (same units as the path). Arcs become straight lines to their
 * end point (fonts do not use them). Closed subpaths end on their first point again.
 */
export function pathToPolylines(d: string, tolerance = 1): Stroke[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Stroke[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastControl: Point | undefined; // for S / T reflections
  let lastCmd = "";
  let stroke: Stroke | undefined;

  const num = () => Number(tokens[i++]);
  const hasNumber = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  const point = (rel: boolean): Point => {
    const x = num();
    const y = num();
    return rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
  };
  const lineTo = (p: Point) => {
    if (!stroke) {
      stroke = [cur];
      out.push(stroke);
    }
    stroke.push(p);
    cur = p;
  };
  const steps = (...pts: Point[]) => {
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return Math.min(64, Math.max(2, Math.ceil(Math.sqrt(len / Math.max(tolerance, 1e-9)))));
  };
  const cubic = (c1: Point, c2: Point, p: Point) => {
    const p0 = cur;
    const n = steps(p0, c1, c2, p);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      lineTo({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p.y,
      });
    }
    lastControl = c2;
  };
  const quad = (c: Point, p: Point) => {
    const p0 = cur;
    const n = steps(p0, c, p);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      lineTo({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p.y });
    }
    lastControl = c;
  };
  const reflect = (types: string) => (lastControl && types.includes(lastCmd.toUpperCase()) ? { x: 2 * cur.x - lastControl.x, y: 2 * cur.y - lastControl.y } : cur);

  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break; // numbers before any command
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        cur = point(rel);
        start = cur;
        stroke = undefined;
        cmd = rel ? "l" : "L"; // further pairs are implicit line-tos
        lastControl = undefined;
        break;
      }
      case "L":
        lineTo(point(rel));
        lastControl = undefined;
        break;
      case "H": {
        const x = num();
        lineTo({ x: rel ? cur.x + x : x, y: cur.y });
        lastControl = undefined;
        break;
      }
      case "V": {
        const y = num();
        lineTo({ x: cur.x, y: rel ? cur.y + y : y });
        lastControl = undefined;
        break;
      }
      case "C": {
        const c1 = point(rel);
        const c2 = point(rel);
        cubic(c1, c2, point(rel));
        break;
      }
      case "S": {
        const c1 = reflect("CS");
        const c2 = point(rel);
        cubic(c1, c2, point(rel));
        break;
      }
      case "Q": {
        const c = point(rel);
        quad(c, point(rel));
        break;
      }
      case "T":
        quad(reflect("QT"), point(rel));
        break;
      case "A": {
        i += 5; // rx ry rotation large-arc sweep
        lineTo(point(rel));
        lastControl = undefined;
        break;
      }
      case "Z":
        if (stroke && (cur.x !== start.x || cur.y !== start.y)) lineTo(start);
        cur = start;
        stroke = undefined;
        lastControl = undefined;
        break;
      default:
        i++; // unknown command: skip a token so we never loop forever
    }
    lastCmd = cmd;
    if (cmd.toUpperCase() === "Z" && hasNumber()) cmd = "";
  }
  return out;
}
