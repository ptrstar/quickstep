import { DEFAULT_SIZE, ERROR, EXT_ARG, EXT_OPCODE, type Instruction, type MoveSize, SLOT } from "./instructions";
import { paramName } from "./params";

/**
 * Resumable decoder with the same state machine as the firmware (firmware/lib/quickstep/src/decoder.cpp).
 * `next(read)` pulls bytes until an instruction is complete. When `read` has nothing (-1) it returns
 * "need-more" and continues where it stopped on the next call. Used by the fake device.
 */
export type StreamResult = Instruction | "need-more" | { error: number };

const EXT_PAYLOAD: Record<number, number> = { 0x00: 0, 0x01: 0, 0x02: 0, 0x03: 5, 0x04: 2, 0x05: 0, 0x06: 0 };
const EXT_BY_OPCODE = new Map<number, keyof typeof EXT_OPCODE>(
  Object.entries(EXT_OPCODE).map(([op, code]) => [code, op as keyof typeof EXT_OPCODE]),
);

export class StreamDecoder {
  private register = 0;
  private slots = 0;
  private size: MoveSize = DEFAULT_SIZE;
  private paused = false;
  private phase: "slot" | "arg" | "ext" | "data" = "slot";
  private pending: Instruction["op"] = "nop";
  private need = 0;
  private data: number[] = [];
  error = 0;

  next(read: () => number): StreamResult {
    if (this.error) return { error: this.error };
    for (;;) {
      if (this.phase === "slot") {
        const s = this.fetchSlot(read);
        if (s < 0) return "need-more";
        if (s === SLOT.PEN) return this.finish("pen");
        if (s === SLOT.END) return this.finish("end");
        if (s === SLOT.MOVE) this.startData("move", this.size === 4 ? 1 : this.size === 8 ? 2 : 4);
        else this.phase = "arg";
      } else if (this.phase === "arg") {
        const a = this.fetchSlot(read);
        if (a < 0) return "need-more";
        if (a !== EXT_ARG) {
          this.size = (4 << a) as MoveSize;
          return this.finish("size");
        }
        this.phase = "ext";
      } else if (this.phase === "ext") {
        const b = read();
        if (b < 0) return "need-more";
        const op = EXT_BY_OPCODE.get(b);
        if (op === undefined) return this.fail(ERROR.UNKNOWN_EXT);
        if (EXT_PAYLOAD[b] === 0) return this.finish(op);
        this.startData(op, EXT_PAYLOAD[b]);
      } else {
        while (this.data.length < this.need) {
          const b = read();
          if (b < 0) return "need-more";
          this.data.push(b);
        }
        return this.finish(this.pending);
      }
    }
  }

  private fetchSlot(read: () => number): number {
    if (this.slots === 0) {
      const b = read();
      if (b < 0) return -1;
      this.register = b;
      this.slots = 4;
    }
    const s = this.register & 0b11;
    this.register >>= 2;
    this.slots--;
    return s;
  }

  private startData(op: Instruction["op"], need: number) {
    this.pending = op;
    this.need = need;
    this.data = [];
    this.phase = "data";
  }

  private fail(code: number): StreamResult {
    this.error = code;
    return { error: code };
  }

  private finish(op: Instruction["op"]): StreamResult {
    this.phase = "slot";
    const d = this.data;
    const s8 = (v: number) => (v & 0x80 ? v - 256 : v);
    const s16 = (v: number) => (v & 0x8000 ? v - 65536 : v);
    let ins: Instruction;
    switch (op) {
      case "size":
        ins = { op, bits: this.size };
        break;
      case "move":
        if (this.size === 4) ins = { op, dx: d[0] & 0x8 ? (d[0] & 0xf) - 16 : d[0] & 0xf, dy: d[0] & 0x80 ? (d[0] >> 4) - 16 : d[0] >> 4 };
        else if (this.size === 8) ins = { op, dx: s8(d[0]), dy: s8(d[1]) };
        else ins = { op, dx: s16(d[0] | (d[1] << 8)), dy: s16(d[2] | (d[3] << 8)) };
        break;
      case "set_param":
        if (paramName(d[0]) === undefined) return this.fail(ERROR.UNKNOWN_PARAM);
        ins = { op, id: d[0], value: new DataView(Uint8Array.from(d.slice(1)).buffer).getFloat32(0, true) };
        break;
      case "dwell":
        ins = { op, ms: d[0] | (d[1] << 8) };
        break;
      case "end":
        this.slots = 0; // padding
        this.size = DEFAULT_SIZE;
        ins = { op };
        break;
      default:
        ins = { op } as Instruction;
    }
    if (this.paused !== (ins.op === "resume")) return this.fail(ERROR.PAUSE_SEQUENCE);
    this.paused = ins.op === "pause";
    return ins;
  }
}
