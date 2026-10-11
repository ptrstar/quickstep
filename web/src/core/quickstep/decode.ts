import {
  DEFAULT_SIZE,
  ERROR,
  EXT_ARG,
  EXT_OPCODE,
  type Instruction,
  type MoveSize,
  SLOT,
} from "./instructions";
import { paramName } from "./params";

/** A stream the device would reject. `code` is the byte it sends back (SPEC §5). */
export class QuickstepError extends Error {
  constructor(
    readonly code: number,
    readonly offset: number,
    message: string,
  ) {
    super(`${message} (code 0x${code.toString(16)}, byte ${offset})`);
  }
}

/** The stream ended in the middle of an instruction. The device would simply wait for more bytes. */
export class TruncatedError extends Error {}

const SIZE_BY_ARG: MoveSize[] = [4, 8, 16];
const EXT_BY_OPCODE = new Map<number, keyof typeof EXT_OPCODE>(
  Object.entries(EXT_OPCODE).map(([op, code]) => [code, op as keyof typeof EXT_OPCODE]),
);

/** Decodes a complete QUICKSTEP byte stream, following the decoder model in SPEC §1. */
export function* decode(bytes: Uint8Array): Generator<Instruction> {
  let ip = 0;
  let register = 0;
  let slots = 0;
  let size: MoveSize = DEFAULT_SIZE;
  let paused = false;

  const byte = () => {
    if (ip >= bytes.length) throw new TruncatedError(`stream ended at byte ${ip}`);
    return bytes[ip++];
  };
  const fetchSlot = () => {
    if (slots === 0) {
      register = byte();
      slots = 4;
    }
    const s = register & 0b11;
    register >>= 2;
    slots--;
    return s;
  };
  const signed = (v: number, bits: number) => (v & (1 << (bits - 1)) ? v - (1 << bits) : v);

  while (ip < bytes.length || slots > 0) {
    const at = ip;
    const s = fetchSlot();
    let ins: Instruction;

    if (s === SLOT.PEN) {
      ins = { op: "pen" };
    } else if (s === SLOT.MOVE) {
      if (size === 4) {
        const b = byte();
        ins = { op: "move", dx: signed(b & 0xf, 4), dy: signed(b >> 4, 4) };
      } else if (size === 8) {
        ins = { op: "move", dx: signed(byte(), 8), dy: signed(byte(), 8) };
      } else {
        const dx = byte() | (byte() << 8);
        const dy = byte() | (byte() << 8);
        ins = { op: "move", dx: signed(dx, 16), dy: signed(dy, 16) };
      }
    } else if (s === SLOT.END) {
      ins = { op: "end" };
    } else {
      const arg = fetchSlot();
      if (arg !== EXT_ARG) {
        size = SIZE_BY_ARG[arg];
        ins = { op: "size", bits: size };
      } else {
        ins = decodeExt(byte, at);
      }
    }

    if (paused !== (ins.op === "resume")) {
      throw new QuickstepError(ERROR.PAUSE_SEQUENCE, at, paused ? "expected RESUME after PAUSE" : "RESUME without PAUSE");
    }
    paused = ins.op === "pause";

    if (ins.op === "end") {
      slots = 0; // remaining slots are padding
      size = DEFAULT_SIZE;
    }
    yield ins;
  }
}

function decodeExt(byte: () => number, at: number): Instruction {
  const opcode = byte();
  const op = EXT_BY_OPCODE.get(opcode);
  switch (op) {
    case undefined:
      throw new QuickstepError(ERROR.UNKNOWN_EXT, at, `unknown extended opcode 0x${opcode.toString(16)}`);
    case "set_param": {
      const id = byte();
      if (paramName(id) === undefined) {
        throw new QuickstepError(ERROR.UNKNOWN_PARAM, at, `unknown parameter id 0x${id.toString(16)}`);
      }
      const raw = Uint8Array.of(byte(), byte(), byte(), byte());
      return { op, id, value: new DataView(raw.buffer).getFloat32(0, true) };
    }
    case "dwell":
      return { op, ms: byte() | (byte() << 8) };
    default:
      return { op };
  }
}

export function decodeAll(bytes: Uint8Array): Instruction[] {
  return [...decode(bytes)];
}
