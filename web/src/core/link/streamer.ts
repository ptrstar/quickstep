import { ERROR } from "../quickstep/instructions";
import { type Job, type JobBoundary, nextBoundary, PAUSE_BYTES, RESUME_BYTES, stopTail } from "./job";

/**
 * Host side of the serial link (SPEC §5), independent of the transport.
 *
 * - Waits for the device's hello and learns its buffer size.
 * - Never has more bytes outstanding than the device has announced free (credit flow control).
 * - Streams a job; pauses and stops at group boundaries by splicing in complete byte groups.
 */
export type LinkState =
  | "connecting" // waiting for the hello after a reset
  | "ready" // idle, accepts commands and jobs
  | "streaming"
  | "pausing" // still sending up to the pause point
  | "paused"
  | "stopping" // still sending up to the stop point
  | "finishing" // everything sent, waiting for the device to take the last bytes
  | "error";

export type JobProgress = {
  total: number;
  /** Job bytes sent and taken out of the device's buffer by the decoder. */
  sent: number;
  consumed: number;
  /** Where sending stops (pause or stop point), if one is pending. */
  holdAt?: JobBoundary;
  stopped: boolean;
};

const HELLO = 0xa5;
const VERSION = 0x02;
const CHUNK = 64;

const ERROR_TEXT: Record<number, string> = {
  [ERROR.UNKNOWN_EXT]: "unknown extended opcode",
  [ERROR.UNKNOWN_PARAM]: "unknown parameter id",
  [ERROR.PAUSE_SEQUENCE]: "PAUSE/RESUME out of order",
  [ERROR.RX_OVERRUN]: "receive buffer overrun",
};

export class Streamer {
  state: LinkState = "connecting";
  capacity = 0;
  outstanding = 0;
  error?: string;

  private hello: number[] = [];
  private queue: Uint8Array[] = [];
  private job?: Job;
  private jobSent = 0;
  private limit = 0; // job bytes to send before holding (pause / stop point) or the job end
  private hold?: { boundary: JobBoundary; kind: "pause" | "stop" };
  private stopped = false;
  private streamSent = 0;
  private streamConsumed = 0;
  private jobStart = 0; // stream offset where the job began
  private inserted: { at: number; length: number }[] = []; // bytes spliced into the job stream

  constructor(
    private readonly write: (bytes: Uint8Array) => void,
    private readonly onChange: () => void = () => {},
  ) {}

  /** After opening the port or resetting the board. */
  reset() {
    this.state = "connecting";
    this.capacity = 0;
    this.outstanding = 0;
    this.error = undefined;
    this.hello = [];
    this.queue = [];
    this.job = undefined;
    this.hold = undefined;
    this.onChange();
  }

  /** Bytes from the device. */
  receive(bytes: Uint8Array) {
    for (const b of bytes) {
      if (this.state === "error") return;
      if (this.state === "connecting") {
        this.hello.push(b);
        if (this.hello[0] !== HELLO) this.hello = [];
        if (this.hello.length === 3) {
          if (this.hello[1] !== VERSION) {
            this.fail(`device speaks protocol ${this.hello[1]}, expected ${VERSION}`);
            return;
          }
          this.capacity = this.hello[2] * 16;
          this.state = "ready";
        }
      } else if (b >= 0x80) {
        this.fail(`device error 0x${b.toString(16)}: ${ERROR_TEXT[b] ?? "unknown"}`);
        return;
      } else {
        this.outstanding = Math.max(0, this.outstanding - b);
        this.streamConsumed += b;
      }
    }
    this.pump();
    this.onChange();
  }

  /** A complete transmission (jog, pen, motors off). Only while ready. */
  command(bytes: Uint8Array): boolean {
    if (this.state !== "ready") return false;
    this.queue.push(bytes);
    this.pump();
    this.onChange();
    return true;
  }

  startJob(job: Job): boolean {
    if (this.state !== "ready") return false;
    this.job = job;
    this.jobSent = 0;
    this.limit = job.bytes.length;
    this.hold = undefined;
    this.stopped = false;
    this.jobStart = this.streamSent + this.queue.reduce((n, q) => n + q.length, 0);
    this.inserted = [];
    this.state = "streaming";
    this.pump();
    this.onChange();
    return true;
  }

  /** Pause at the next boundary where the pen is up ("pen-up"), or at the very next boundary ("now"). */
  pause(mode: "pen-up" | "now" = "pen-up") {
    if (this.state !== "streaming" || !this.job) return;
    // A pause point must come before the end of the job; prefer one with the pen up.
    const end = this.job.bytes.length;
    const usable = (b?: JobBoundary) => (b && b.offset < end ? b : undefined);
    const b =
      (mode === "pen-up" ? usable(nextBoundary(this.job, this.jobSent, true)) : undefined) ??
      usable(nextBoundary(this.job, this.jobSent));
    if (!b) return; // nothing left to pause before
    this.holdAt(b, "pause");
  }

  resume() {
    if (this.state === "pausing") {
      // not reached yet: just keep streaming
      this.hold = undefined;
      this.limit = this.job!.bytes.length;
      this.state = "streaming";
    } else if (this.state === "paused") {
      this.insert(RESUME_BYTES);
      this.hold = undefined;
      this.limit = this.job!.bytes.length;
      this.state = "streaming";
    }
    this.pump();
    this.onChange();
  }

  /** Stop at the next boundary: lift the pen, travel back to the job start, END. */
  stop() {
    if (!this.job) return;
    if (this.state === "paused") {
      this.insert(RESUME_BYTES); // the decoder expects RESUME after PAUSE
      this.finishStop(this.hold!.boundary);
    } else if (this.state === "streaming" || this.state === "pausing") {
      const b = nextBoundary(this.job, this.jobSent);
      if (b) this.holdAt(b, "stop");
    }
    this.pump();
    this.onChange();
  }

  progress(): JobProgress | undefined {
    if (!this.job) return undefined;
    // stream bytes consumed since the job began, minus spliced-in bytes
    let consumed = this.streamConsumed - this.jobStart;
    for (const ins of this.inserted) {
      if (ins.at < this.streamConsumed) consumed -= Math.min(ins.length, this.streamConsumed - ins.at);
    }
    return {
      total: this.job.bytes.length,
      sent: this.jobSent,
      consumed: Math.max(0, Math.min(consumed, this.jobSent)),
      holdAt: this.hold?.boundary,
      stopped: this.stopped,
    };
  }

  private holdAt(b: JobBoundary, kind: "pause" | "stop") {
    this.hold = { boundary: b, kind };
    this.limit = b.offset;
    this.state = kind === "pause" ? "pausing" : "stopping";
    this.pump();
    this.onChange();
  }

  private finishStop(b: JobBoundary) {
    this.queue.push(stopTail(b));
    this.limit = this.jobSent; // the rest of the job is dropped
    this.stopped = true;
    this.hold = undefined;
    this.state = "finishing";
  }

  /** Splices bytes into the job stream right at the current send position. */
  private insert(bytes: Uint8Array) {
    this.inserted.push({ at: this.streamSent + this.queue.reduce((n, q) => n + q.length, 0), length: bytes.length });
    this.queue.push(bytes);
  }

  private pump() {
    if (this.state === "connecting" || this.state === "error") return;
    for (;;) {
      // reached the hold point?
      if (this.hold && this.jobSent >= this.limit && this.queue.length === 0) {
        if (this.hold.kind === "pause" && this.state === "pausing") {
          this.insert(PAUSE_BYTES);
          this.state = "paused";
        } else if (this.hold.kind === "stop" && this.state === "stopping") {
          this.finishStop(this.hold.boundary);
        }
      }
      const credit = this.capacity - this.outstanding;
      if (credit <= 0) break;
      let chunk: Uint8Array | undefined;
      if (this.queue.length > 0) {
        const head = this.queue[0];
        chunk = head.subarray(0, credit);
        if (chunk.length === head.length) this.queue.shift();
        else this.queue[0] = head.subarray(chunk.length);
      } else if (this.job && this.jobSent < this.limit) {
        const n = Math.min(credit, CHUNK, this.limit - this.jobSent);
        chunk = this.job.bytes.subarray(this.jobSent, this.jobSent + n);
        this.jobSent += n;
      }
      if (!chunk || chunk.length === 0) break;
      this.outstanding += chunk.length;
      this.streamSent += chunk.length;
      this.write(chunk);
    }
    if (this.job && this.queue.length === 0 && this.jobSent >= this.job.bytes.length && this.state === "streaming") {
      this.state = "finishing";
    }
    if (this.state === "finishing" && this.queue.length === 0 && this.outstanding === 0) {
      this.state = "ready";
    }
  }

  private fail(message: string) {
    this.state = "error";
    this.error = message;
    this.onChange();
  }
}
