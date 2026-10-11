import type { Drawing, Point } from "../geometry";
import { moveCost } from "./encode";
import { DEFAULT_SIZE, type Instruction, MAX_COMPONENT, type MoveSize } from "./instructions";
import { type MachineParams, PARAMS, type ParamName } from "./params";

export type CompileOptions = {
  /** Start the job with SET_PARAM for every parameter, so the device matches `params`. */
  header?: boolean;
};

type Token = { op: "pen" } | { op: "move"; dx: number; dy: number };

const SIZES: MoveSize[] = [4, 8, 16];
const SIZE_SWITCH_COST = 2; // two slots, in quarter bytes

/**
 * Drawing (mm) → instructions for one job: travel to each stroke, pen down, draw, pen up,
 * then return to the origin and END. Positions are rounded per axis in absolute coordinates,
 * so rounding errors never accumulate.
 */
export function compile(drawing: Drawing, params: MachineParams, options: CompileOptions = {}): Instruction[] {
  const { header = true } = options;
  const toSteps = (p: Point): Point => ({
    x: Math.round(p.x * params.steps_per_mm_x) || 0, // no -0
    y: Math.round(p.y * params.steps_per_mm_y) || 0,
  });

  const tokens: Token[] = [];
  let at: Point = { x: 0, y: 0 };
  const moveTo = (target: Point) => {
    const dx = target.x - at.x;
    const dy = target.y - at.y;
    if (dx !== 0 || dy !== 0) tokens.push({ op: "move", dx, dy });
    at = target;
  };

  for (const stroke of drawing) {
    if (stroke.length === 0) continue;
    moveTo(toSteps(stroke[0]));
    tokens.push({ op: "pen" });
    for (const p of stroke.slice(1)) moveTo(toSteps(p));
    tokens.push({ op: "pen" });
  }
  moveTo({ x: 0, y: 0 });

  const out: Instruction[] = [];
  if (header) {
    for (const name of Object.keys(PARAMS) as ParamName[]) {
      out.push({ op: "set_param", id: PARAMS[name].id, value: params[name] });
    }
  }
  out.push(...packMoves(tokens), { op: "end" });
  return out;
}

/** Number of MOVE instructions needed for (dx, dy) at a given size. */
export function chunkCount(dx: number, dy: number, size: MoveSize): number {
  return Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_COMPONENT[size]);
}

/**
 * Splits a move into `n` nearly equal, collinear chunks whose endpoints are the rounded points
 * of the ideal line. Rounding is symmetric in sign, so mirrored moves split identically.
 */
export function splitMove(dx: number, dy: number, n: number): Point[] {
  const r = (v: number) => Math.sign(v) * Math.round(Math.abs(v));
  const chunks: Point[] = [];
  let px = 0;
  let py = 0;
  for (let i = 1; i <= n; i++) {
    const x = r((dx * i) / n);
    const y = r((dy * i) / n);
    chunks.push({ x: x - px, y: y - py });
    px = x;
    py = y;
  }
  return chunks;
}

/**
 * Chooses the int size of every move to minimise the encoded byte count (dynamic programming
 * over the 3 sizes, with the cost of switching), then emits SIZE switches and split moves.
 * Pen toggles do not affect the size, so they are passed through.
 */
export function packMoves(tokens: Token[]): Instruction[] {
  const moves = tokens.filter((t) => t.op === "move");

  // cost[i][k]: cheapest encoding of moves[0..i] with moves[i] encoded at SIZES[k]
  let cost: number[] = SIZES.map((s) => (s === DEFAULT_SIZE ? 0 : SIZE_SWITCH_COST));
  const from: number[][] = [];
  for (const m of moves) {
    const prev = cost;
    const back: number[] = [];
    cost = SIZES.map((s, k) => {
      let best = Infinity;
      for (let j = 0; j < SIZES.length; j++) {
        const c = prev[j] + (j === k ? 0 : SIZE_SWITCH_COST);
        if (c < best) {
          best = c;
          back[k] = j;
        }
      }
      return best + chunkCount(m.dx, m.dy, s) * moveCost(s);
    });
    from.push(back);
  }

  // Backtrack the chosen size per move.
  const chosen: MoveSize[] = new Array(moves.length);
  let k = cost.indexOf(Math.min(...cost));
  for (let i = moves.length - 1; i >= 0; i--) {
    chosen[i] = SIZES[k];
    k = from[i][k];
  }

  const out: Instruction[] = [];
  let size: MoveSize = DEFAULT_SIZE;
  let i = 0;
  for (const t of tokens) {
    if (t.op === "pen") {
      out.push(t);
      continue;
    }
    const s = chosen[i++];
    if (s !== size) {
      out.push({ op: "size", bits: s });
      size = s;
    }
    for (const c of splitMove(t.dx, t.dy, chunkCount(t.dx, t.dy, s))) {
      out.push({ op: "move", dx: c.x, dy: c.y });
    }
  }
  return out;
}
