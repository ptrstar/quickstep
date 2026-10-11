import type { Point } from "../geometry";
import { header, packMoves, toSteps } from "../quickstep/compile";
import { decodeAll } from "../quickstep/decode";
import { type Boundary, encode, encodeWithBoundaries } from "../quickstep/encode";
import { DEFAULT_SIZE, type Instruction, type MoveSize } from "../quickstep/instructions";
import type { MachineParams } from "../quickstep/params";

/**
 * The instructions a job really runs: by default the machine panel's parameters, sent as a header
 * (the program's own SET_PARAMs are dropped); or the program's parameters as they are.
 * The simulator and the sender both use this, so what is simulated is what is sent.
 */
export function prepareInstructions(program: Instruction[], params: MachineParams, useProgramParams: boolean): Instruction[] {
  if (useProgramParams) return program;
  return [...header(params), ...program.filter((i) => i.op !== "set_param" && i.op !== "reset_params")];
}

export type JobBoundary = Boundary & {
  /** Pen state and position (full steps from the job start) at this point of the program. */
  penDown: boolean;
  at: Point;
  /** Non-zero moves before this point: the planner works in moves, progress is measured in them. */
  moves: number;
};

/** `instructions` are exactly what the device decodes from `bytes` (parameter values rounded to f32). */
export type Job = { instructions: Instruction[]; bytes: Uint8Array; boundaries: JobBoundary[] };

/**
 * Puts an END after every pen lift, so the stream has a group boundary there and the job can be
 * paused with the pen up. Free in time (a pen toggle already stops the machine), at most about a
 * byte per stroke. END resets the move size to 8, so a different size is set again after it.
 */
export function addPausePoints(program: Instruction[]): Instruction[] {
  const out: Instruction[] = [];
  let penDown = false;
  let size: MoveSize = DEFAULT_SIZE;
  program.forEach((ins, i) => {
    out.push(ins);
    if (ins.op === "size") size = ins.bits;
    if (ins.op === "end") size = DEFAULT_SIZE;
    if (ins.op !== "pen") return;
    penDown = !penDown;
    if (penDown || program[i + 1]?.op === "end" || i === program.length - 1) return;
    out.push({ op: "end" });
    if (size !== DEFAULT_SIZE) out.push({ op: "size", bits: size });
  });
  return out;
}

export function buildJob(program: Instruction[], options: { pausePoints?: boolean } = {}): Job {
  const { pausePoints = true } = options;
  const { bytes, boundaries } = encodeWithBoundaries(pausePoints ? addPausePoints(program) : program);
  const instructions = decodeAll(bytes);
  // pen, position and move count before each instruction index
  const state: { penDown: boolean; at: Point; moves: number }[] = [];
  let penDown = false;
  let at = { x: 0, y: 0 };
  let moves = 0;
  for (const ins of instructions) {
    state.push({ penDown, at, moves });
    if (ins.op === "pen") penDown = !penDown;
    if (ins.op === "move" && (ins.dx !== 0 || ins.dy !== 0)) {
      at = { x: at.x + ins.dx, y: at.y + ins.dy };
      moves++;
    }
  }
  state.push({ penDown, at, moves });
  return { instructions, bytes, boundaries: boundaries.map((b) => ({ ...b, ...state[b.index] })) };
}

/** The last boundary at or before `offset` bytes of the job. */
export function boundaryAt(job: Job, offset: number): JobBoundary {
  const bs = job.boundaries;
  let lo = 0;
  let hi = bs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bs[mid].offset <= offset) lo = mid;
    else hi = mid - 1;
  }
  return bs[lo];
}

/** The first boundary at or after `offset`, optionally only where the pen is up. */
export function nextBoundary(job: Job, offset: number, penUp = false): JobBoundary | undefined {
  return job.boundaries.find((b) => b.offset >= offset && (!penUp || !b.penDown));
}

// ---- small commands, each a complete transmission ending with END (SPEC §4) ----

/** PAUSE + RESUME fill exactly one opcode byte: DD 01 02. Send the first two to pause, the last to resume. */
export const PAUSE_BYTES = encode([{ op: "pause" }, { op: "resume" }]).slice(0, 2);
export const RESUME_BYTES = encode([{ op: "pause" }, { op: "resume" }]).slice(2);

/** Relative jog in mm, rounded to full steps. Returns the steps actually moved. */
export function jog(dxMm: number, dyMm: number, params: MachineParams): { bytes: Uint8Array; steps: Point } {
  const steps = toSteps({ x: dxMm, y: dyMm }, params);
  const tokens = steps.x || steps.y ? [{ op: "move" as const, dx: steps.x, dy: steps.y }] : [];
  return { bytes: encode([...packMoves(tokens), { op: "end" }]), steps };
}

export const PEN_TOGGLE_BYTES = encode([{ op: "pen" }, { op: "end" }]);
export const MOTORS_OFF_BYTES = encode([{ op: "motors_off" }, { op: "end" }]);

/**
 * Ends a job early at `b`: lift the pen if it is down, travel back to the job start, END.
 * The device may be at any move size there, so the tail sets size 8 first, which packMoves assumes.
 */
export function stopTail(b: JobBoundary): Uint8Array {
  const tokens = [
    ...(b.penDown ? [{ op: "pen" as const }] : []),
    ...(b.at.x || b.at.y ? [{ op: "move" as const, dx: -b.at.x, dy: -b.at.y }] : []),
  ];
  return encode([{ op: "size", bits: 8 }, ...packMoves(tokens), { op: "end" }]);
}
