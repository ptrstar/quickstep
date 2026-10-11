import {
  DEFAULT_SIZE,
  EXT_ARG,
  EXT_OPCODE,
  type Instruction,
  MOVE_BYTES,
  type MoveSize,
  SIZE_ARG,
  SLOT,
} from "./instructions";
import { paramName } from "./params";

const RANGE: Record<MoveSize, [number, number]> = { 4: [-8, 7], 8: [-128, 127], 16: [-32768, 32767] };

/**
 * Packs instructions into the QUICKSTEP byte stream (SPEC §1).
 * Data bytes are attached to the slot that makes the decoder read them, so an EXT whose
 * argument slot falls into the next opcode byte has its data after that byte.
 */
export function encode(instructions: Iterable<Instruction>): Uint8Array {
  return encodeWithBoundaries(instructions).bytes;
}

/**
 * A group boundary: the stream up to `offset` holds complete opcode bytes with all their data, and
 * exactly the instructions before `index`. Any complete group of bytes may be inserted there
 * without changing the meaning of what follows, e.g. PAUSE + RESUME (SPEC §3).
 */
export type Boundary = { offset: number; index: number };

export function encodeWithBoundaries(instructions: Iterable<Instruction>): { bytes: Uint8Array; boundaries: Boundary[] } {
  const out: number[] = [];
  const boundaries: Boundary[] = [];
  let index = 0;
  let register = 0;
  let slots = 0;
  let pending: number[] = [];

  const flush = () => {
    out.push(register, ...pending);
    register = 0;
    slots = 0;
    pending = [];
  };
  const slot = (bits: number, data: number[] = [], first = false) => {
    if (slots === 4) flush();
    if (first && slots === 0) boundaries.push({ offset: out.length, index });
    register |= bits << (2 * slots);
    slots++;
    pending.push(...data);
  };
  const ext = (opcode: number, payload: number[] = []) => {
    slot(SLOT.PREFIX, [], true);
    slot(EXT_ARG, [opcode, ...payload]);
  };

  let size: MoveSize = DEFAULT_SIZE;
  for (const ins of instructions) {
    switch (ins.op) {
      case "pen":
        slot(SLOT.PEN, [], true);
        break;
      case "size":
        slot(SLOT.PREFIX, [], true);
        slot(SIZE_ARG[ins.bits]);
        size = ins.bits;
        break;
      case "move":
        slot(SLOT.MOVE, moveData(ins.dx, ins.dy, size), true);
        break;
      case "end":
        slot(SLOT.END, [], true);
        flush();
        size = DEFAULT_SIZE;
        break;
      case "set_param": {
        if (paramName(ins.id) === undefined) throw new RangeError(`unknown param id ${ins.id}`);
        const f = new DataView(new ArrayBuffer(4));
        f.setFloat32(0, ins.value, true);
        ext(EXT_OPCODE.set_param, [ins.id, ...new Uint8Array(f.buffer)]);
        break;
      }
      case "dwell":
        if (!Number.isInteger(ins.ms) || ins.ms < 0 || ins.ms > 0xffff) {
          throw new RangeError(`dwell ms out of range: ${ins.ms}`);
        }
        ext(EXT_OPCODE.dwell, [ins.ms & 0xff, ins.ms >> 8]);
        break;
      default:
        ext(EXT_OPCODE[ins.op]);
    }
    index++;
  }
  // The end is only a boundary if the last opcode byte needed no padding (padding slots would run as PEN).
  const padded = slots > 0 && slots < 4;
  if (slots > 0) flush();
  if (!padded) boundaries.push({ offset: out.length, index });
  return { bytes: Uint8Array.from(out), boundaries };
}

function moveData(dx: number, dy: number, size: MoveSize): number[] {
  const [lo, hi] = RANGE[size];
  for (const v of [dx, dy]) {
    if (!Number.isInteger(v) || v < lo || v > hi) {
      throw new RangeError(`move component ${v} does not fit int${size}`);
    }
  }
  switch (size) {
    case 4:
      return [((dy & 0xf) << 4) | (dx & 0xf)];
    case 8:
      return [dx & 0xff, dy & 0xff];
    case 16:
      return [dx & 0xff, (dx >> 8) & 0xff, dy & 0xff, (dy >> 8) & 0xff];
  }
}

/** Encoded size of one MOVE in quarter bytes (1 slot = 1, 1 data byte = 4). */
export function moveCost(size: MoveSize): number {
  return 1 + 4 * MOVE_BYTES[size];
}
