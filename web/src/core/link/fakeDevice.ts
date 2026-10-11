import { ERROR, type Instruction } from "../quickstep/instructions";
import { StreamDecoder } from "../quickstep/streamDecoder";

/**
 * Stand-in for the plotter's serial side, matching firmware/src/uart.cpp and main.cpp: a 255-byte
 * receive buffer, the firmware's decoder state machine, credit reports in batches of 32 (or when
 * the buffer runs empty) and error bytes. How fast it consumes is up to the caller.
 */
export class FakeDevice {
  static readonly RX_SIZE = 255;
  readonly received: number[] = [];
  readonly instructions: Instruction[] = [];
  error = 0;

  private buffer: number[] = [];
  private output: number[] = [];
  private freed = 0;
  private decoder = new StreamDecoder();

  constructor(private readonly reportEvery = 32) {}

  /** Power-on or reset: hello with protocol version and buffer size / 16. */
  boot() {
    this.buffer = [];
    this.freed = 0;
    this.decoder = new StreamDecoder();
    this.error = 0;
    this.output.push(0xa5, 0x02, Math.floor(FakeDevice.RX_SIZE / 16));
  }

  /** Bytes from the host. */
  receive(bytes: Uint8Array) {
    for (const b of bytes) {
      if (this.error) return;
      this.received.push(b);
      if (this.buffer.length >= FakeDevice.RX_SIZE) this.fail(ERROR.RX_OVERRUN);
      else this.buffer.push(b);
    }
  }

  /** Decodes up to `maxBytes` from the buffer, as the main loop would while the planner has room. */
  consume(maxBytes = Infinity) {
    let budget = maxBytes;
    const read = () => {
      if (budget <= 0 || this.buffer.length === 0) return -1;
      budget--;
      this.freed++;
      return this.buffer.shift()!;
    };
    while (!this.error) {
      const r = this.decoder.next(read);
      if (r === "need-more") break;
      if ("error" in r) {
        this.fail(r.error);
        break;
      }
      this.instructions.push(r);
    }
    if (this.freed >= this.reportEvery || (this.freed > 0 && this.buffer.length === 0)) {
      while (this.freed > 0) {
        const k = Math.min(this.freed, 127);
        this.output.push(k);
        this.freed -= k;
      }
    }
  }

  /** Waiting for RESUME after a PAUSE. */
  get paused(): boolean {
    return this.instructions.at(-1)?.op === "pause";
  }

  get buffered(): number {
    return this.buffer.length;
  }

  /** Bytes for the host since the last call. */
  takeOutput(): Uint8Array {
    const out = Uint8Array.from(this.output);
    this.output = [];
    return out;
  }

  private fail(code: number) {
    this.error = code;
    this.output.push(code);
  }
}
