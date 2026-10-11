import type { Drawing, Point } from "../geometry";
import { moveCost } from "./encode";
import { DEFAULT_SIZE, type Instruction, MAX_COMPONENT, type MoveSize } from "./instructions";
import { type MachineParams, PARAMS, type ParamName } from "./params";

export type CompileOptions = {
  /** Start the job with SET_PARAM for every parameter, so the device matches `params`. */
  header?: boolean;
};

/**
 * Input of packMoves: instructions in drawing order, where moves may be any size (they get split)
 * and SIZE / END are not allowed (packMoves owns the move size).
 */
export type Token = Exclude<Instruction, { op: "size" } | { op: "end" }>;

const SIZES: MoveSize[] = [4, 8, 16];
const SIZE_SWITCH_COST = 2; // two slots, in quarter bytes

/** mm → full steps per axis, rounded. */
export function toSteps(p: Point, params: MachineParams): Point {
  return {
    x: Math.round(p.x * params.steps_per_mm_x) || 0, // no -0
    y: Math.round(p.y * params.steps_per_mm_y) || 0,
  };
}

/** SET_PARAM for every parameter, so the device matches `params`. */
export function header(params: MachineParams): Instruction[] {
  return (Object.keys(PARAMS) as ParamName[]).map((name) => ({ op: "set_param", id: PARAMS[name].id, value: params[name] }));
}

/**
 * Tokens that draw `drawing` (mm, relative to the job origin) starting from `from` (full steps):
 * travel to each stroke, pen down, draw, pen up. Positions are rounded per axis in absolute
 * coordinates, so rounding errors never accumulate. Also returns the final position.
 */
export function strokeTokens(
  drawing: Drawing,
  params: MachineParams,
  from: Point = { x: 0, y: 0 },
): { tokens: Token[]; at: Point } {
  const tokens: Token[] = [];
  let at = from;
  const moveTo = (target: Point) => {
    const dx = target.x - at.x;
    const dy = target.y - at.y;
    if (dx !== 0 || dy !== 0) tokens.push({ op: "move", dx, dy });
    at = target;
  };
  for (const stroke of drawing) {
    if (stroke.length === 0) continue;
    moveTo(toSteps(stroke[0], params));
    tokens.push({ op: "pen" });
    for (const p of stroke.slice(1)) moveTo(toSteps(p, params));
    tokens.push({ op: "pen" });
  }
  return { tokens, at };
}

/** Drawing (mm) → one complete job: optional parameter header, the strokes, back to the origin, END. */
export function compile(drawing: Drawing, params: MachineParams, options: CompileOptions = {}): Instruction[] {
  const { header: withHeader = true } = options;
  const { tokens, at } = strokeTokens(drawing, params);
  if (at.x !== 0 || at.y !== 0) tokens.push({ op: "move", dx: -at.x, dy: -at.y });
  return [...(withHeader ? header(params) : []), ...packMoves(tokens), { op: "end" }];
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
 * Every other instruction is passed through. The device is assumed to be at the default size (8)
 * when the tokens start, as at the beginning of a job or right after END.
 */
export function packMoves(tokens: Token[]): Instruction[] {
  for (const t of tokens as Instruction[]) {
    if (t.op === "size" || t.op === "end") throw new TypeError("packMoves owns SIZE and END");
  }
  const moves = tokens.filter((t) => t.op === "move");

  // cost[k]: cheapest encoding of the moves so far, with the last one encoded at SIZES[k]
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
    if (t.op !== "move") {
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
