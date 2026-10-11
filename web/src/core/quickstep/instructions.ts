// QUICKSTEP v2 instruction model. See protocol/SPEC.md.

export type MoveSize = 4 | 8 | 16;

export type Instruction =
  | { op: "pen" }
  | { op: "size"; bits: MoveSize }
  | { op: "move"; dx: number; dy: number }
  | { op: "end" }
  | { op: "nop" }
  | { op: "pause" }
  | { op: "resume" }
  | { op: "set_param"; id: number; value: number }
  | { op: "dwell"; ms: number }
  | { op: "motors_off" }
  | { op: "reset_params" };

export const SLOT = { PEN: 0b00, PREFIX: 0b01, MOVE: 0b10, END: 0b11 } as const;

/** Argument slot after the `01` prefix. */
export const SIZE_ARG: Record<MoveSize, number> = { 4: 0b00, 8: 0b01, 16: 0b10 };
export const EXT_ARG = 0b11;

export const EXT_OPCODE = {
  nop: 0x00,
  pause: 0x01,
  resume: 0x02,
  set_param: 0x03,
  dwell: 0x04,
  motors_off: 0x05,
  reset_params: 0x06,
} as const;

export type ExtOp = keyof typeof EXT_OPCODE;

export const DEFAULT_SIZE: MoveSize = 8;

/** Largest |component| encodable in one move. Symmetric, so -8 / -128 / -32768 are never produced. */
export const MAX_COMPONENT: Record<MoveSize, number> = { 4: 7, 8: 127, 16: 32767 };

/** Data bytes of one MOVE per size. */
export const MOVE_BYTES: Record<MoveSize, number> = { 4: 1, 8: 2, 16: 4 };

/** Error codes sent by the device (SPEC §5). */
export const ERROR = {
  UNKNOWN_EXT: 0x81,
  UNKNOWN_PARAM: 0x82,
  PAUSE_SEQUENCE: 0x83,
  RX_OVERRUN: 0x84,
} as const;
