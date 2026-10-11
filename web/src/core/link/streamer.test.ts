import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { spiral, star } from "../demo";
import { compile } from "../quickstep/compile";
import { decodeAll } from "../quickstep/decode";
import { encode } from "../quickstep/encode";
import { toHex } from "../quickstep/hex";
import type { Instruction } from "../quickstep/instructions";
import { DEFAULT_PARAMS } from "../quickstep/params";
import { trace } from "../quickstep/trace";
import { FakeDevice } from "./fakeDevice";
import { buildJob, jog, PAUSE_BYTES, RESUME_BYTES, stopTail } from "./job";
import { Streamer } from "./streamer";

/** Star: few bytes, many pen changes. Spiral: long enough (a few KB) to pause and stop in the middle. */
const job = () => buildJob(compile(star(), DEFAULT_PARAMS));
const longJob = () => buildJob(compile([...spiral(), ...star()], DEFAULT_PARAMS));

/** Streamer wired to a fake device. `step` lets the device decode some bytes and delivers its replies. */
function link() {
  const device = new FakeDevice();
  const streamer = new Streamer((bytes) => device.receive(bytes));
  const step = (bytes = 16) => {
    device.consume(bytes);
    streamer.receive(device.takeOutput());
  };
  const runUntil = (done: () => boolean, bytes = 16, limit = 1_000_000) => {
    for (let i = 0; i < limit && !done(); i++) step(bytes);
  };
  device.boot();
  streamer.receive(device.takeOutput());
  return { device, streamer, step, runUntil };
}

const withoutPause = (ins: Instruction[]) => ins.filter((i) => i.op !== "pause" && i.op !== "resume");

describe("pause bytes", () => {
  it("PAUSE + RESUME are exactly one opcode byte and two data bytes", () => {
    expect(toHex(PAUSE_BYTES)).toBe("DD 01");
    expect(toHex(RESUME_BYTES)).toBe("02");
  });

  it("can be spliced in at every boundary of a job", () => {
    const j = job();
    for (const b of j.boundaries.filter((_, i) => i % 7 === 0)) {
      const spliced = Uint8Array.from([...j.bytes.slice(0, b.offset), ...PAUSE_BYTES, ...RESUME_BYTES, ...j.bytes.slice(b.offset)]);
      const want = [...j.instructions.slice(0, b.index), { op: "pause" }, { op: "resume" }, ...j.instructions.slice(b.index)];
      expect(decodeAll(spliced)).toEqual(want);
    }
  });

  it("boundaries know pen state and position", () => {
    const j = job();
    for (const b of j.boundaries) {
      const t = trace(j.instructions.slice(0, b.index));
      expect(b.penDown).toBe(t.penDown);
      expect(b.at).toEqual(t.end);
    }
  });
});

describe("Streamer", () => {
  it("sends nothing before the hello, then only up to the announced buffer", () => {
    const device = new FakeDevice();
    const sent: number[] = [];
    const s = new Streamer((b) => {
      sent.push(...b);
      device.receive(b);
    });
    expect(s.startJob(job())).toBe(false);
    device.boot();
    s.receive(device.takeOutput());
    expect(s.state).toBe("ready");
    expect(s.capacity).toBe(240);
    s.startJob(job());
    expect(sent.length).toBe(240);
  });

  it("streams a whole job without overrunning the device, whatever its pace", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 1, maxLength: 50 }), (paces) => {
        const { device, streamer, step } = link();
        const j = buildJob(compile(spiral(3), DEFAULT_PARAMS));
        streamer.startJob(j);
        let i = 0;
        while (streamer.state !== "ready" && i < 100000) step(paces[i++ % paces.length] || 1);
        expect(device.error).toBe(0);
        expect(Uint8Array.from(device.received)).toEqual(j.bytes);
        expect(device.instructions).toEqual(j.instructions);
        expect(streamer.progress()).toMatchObject({ consumed: j.bytes.length, sent: j.bytes.length });
      }),
      { numRuns: 30 },
    );
  });

  it("pauses at the next pen-up boundary and resumes where it left off", () => {
    const { device, streamer, step, runUntil } = link();
    const j = longJob();
    streamer.startJob(j);
    step(100);
    streamer.pause("pen-up");
    const hold = streamer.progress()!.holdAt!;
    expect(hold.penDown).toBe(false);
    runUntil(() => device.paused);
    expect(streamer.state).toBe("paused");
    // the device ran everything before the pause point, pen up, and nothing after it
    expect(withoutPause(device.instructions)).toEqual(j.instructions.slice(0, hold.index));
    expect(trace(device.instructions).penDown).toBe(false);
    for (let i = 0; i < 20; i++) step();
    expect(device.instructions.at(-1)).toEqual({ op: "pause" });

    streamer.resume();
    runUntil(() => streamer.state === "ready");
    expect(device.error).toBe(0);
    expect(withoutPause(device.instructions)).toEqual(j.instructions);
    expect(streamer.progress()!.consumed).toBe(j.bytes.length);
  });

  it("pause 'now' stops at the very next boundary", () => {
    const { device, streamer, step, runUntil } = link();
    const j = longJob();
    streamer.startJob(j);
    step(300);
    const sent = streamer.progress()!.sent;
    streamer.pause("now");
    const hold = streamer.progress()!.holdAt!;
    expect(hold.offset).toBe(j.boundaries.find((b) => b.offset >= sent)!.offset);
    runUntil(() => device.paused);
    streamer.resume();
    runUntil(() => streamer.state === "ready");
    expect(withoutPause(device.instructions)).toEqual(j.instructions);
  });

  it("stop lifts the pen, travels home and ends", () => {
    for (const pace of [7, 50, 400]) {
      const { device, streamer, step, runUntil } = link();
      const j = longJob();
      streamer.startJob(j);
      step(pace);
      step(pace);
      streamer.stop();
      runUntil(() => streamer.state === "ready");
      expect(device.error).toBe(0);
      const t = trace(device.instructions);
      expect(t.end).toEqual({ x: 0, y: 0 });
      expect(t.penDown).toBe(false);
      expect(device.instructions.at(-1)).toEqual({ op: "end" });
      expect(streamer.progress()!.stopped).toBe(true);
    }
  });

  it("stop while paused resumes the decoder first", () => {
    const { device, streamer, step, runUntil } = link();
    streamer.startJob(longJob());
    step(100);
    streamer.pause("now");
    runUntil(() => device.paused);
    streamer.stop();
    runUntil(() => streamer.state === "ready");
    expect(device.error).toBe(0);
    expect(trace(device.instructions).end).toEqual({ x: 0, y: 0 });
  });

  it("reports device errors and stops sending", () => {
    const { device, streamer } = link();
    device.receive(Uint8Array.of(0x0d, 0x07)); // unknown ext opcode
    device.consume();
    streamer.receive(device.takeOutput());
    expect(streamer.state).toBe("error");
    expect(streamer.error).toContain("unknown extended opcode");
    expect(streamer.startJob(job())).toBe(false);
  });

  it("accepts commands only while ready", () => {
    const { device, streamer, step, runUntil } = link();
    const j = jog(8, 0, DEFAULT_PARAMS);
    expect(j.steps).toEqual({ x: 40, y: 0 });
    expect(streamer.command(j.bytes)).toBe(true);
    runUntil(() => streamer.state === "ready" && device.buffered === 0);
    expect(device.instructions).toEqual([{ op: "move", dx: 40, dy: 0 }, { op: "end" }]);
    streamer.startJob(job());
    step();
    expect(streamer.command(j.bytes)).toBe(false);
  });
});

describe("stopTail", () => {
  it("works from any move size", () => {
    const tail = stopTail({ offset: 0, index: 0, penDown: true, at: { x: 300, y: -5 }, moves: 0 });
    // leave the device at size 4 (SIZE 4 + NOP fill one opcode byte); the tail's SIZE 8 must undo that
    const before = encode([{ op: "size", bits: 4 }, { op: "nop" }]);
    expect(toHex(before)).toBe("D1 00");
    const t = trace(decodeAll(Uint8Array.from([...before, ...tail])));
    expect(t.end).toEqual({ x: -300, y: 5 });
    expect(t.penDown).toBe(true); // toggled once from the (assumed up) start of this decode
  });
});

describe("addPausePoints", () => {
  it("gives every pen lift a pen-up boundary and changes nothing else", () => {
    const program = compile([...spiral(3), ...star()], DEFAULT_PARAMS);
    const plain = buildJob(program, { pausePoints: false });
    const j = buildJob(program);
    const lifts = trace(program).strokes.length;
    const upBoundaries = j.boundaries.filter((b, i) => !b.penDown && j.boundaries[i - 1]?.penDown);
    expect(upBoundaries.length).toBeGreaterThanOrEqual(lifts - 1);
    // same drawing, a few bytes more
    expect(trace(j.instructions)).toEqual(trace(plain.instructions));
    expect(j.bytes.length - plain.bytes.length).toBeLessThanOrEqual(2 * lifts);
  });
});
