"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { Point } from "@/core/geometry";
import { type Job, jog, MOTORS_OFF_BYTES, PEN_TOGGLE_BYTES } from "@/core/link/job";
import { Streamer } from "@/core/link/streamer";
import type { MachineParams } from "@/core/quickstep";
import type { Simulation } from "@/core/sim";
import { openSimulated, openWebSerial, type Transport } from "./transport";

export type ActiveJob = { job: Job; sim: Simulation };

/** Holds the current transport outside React state; the streamer writes through it. */
class Pipe {
  private transport?: Transport;
  set(t?: Transport) {
    this.transport = t;
  }
  get() {
    return this.transport;
  }
  write(bytes: Uint8Array) {
    this.transport?.write(bytes);
  }
}

/** Bytes per second the simulated plotter takes when idle (commands) */
const SIM_COMMAND_RATE = 4000;

/** One plotter connection: the streamer (protocol), a transport (USB or simulated) and jog state. */
export function usePlotter() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [pipe] = useState(() => new Pipe());
  // the job being plotted; a ref too, for the simulated plotter's pace
  const activeRef = useRef<ActiveJob>(undefined);
  const [active, setActiveState] = useState<ActiveJob>();
  const setActive = (a?: ActiveJob) => {
    activeRef.current = a;
    setActiveState(a);
  };
  const [s] = useState(() => new Streamer((bytes) => pipe.write(bytes), rerender));
  const [kind, setKind] = useState<"usb" | "sim">();
  const [message, setMessage] = useState<string>();
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 }); // full steps jogged since "zero"
  const [penDown, setPenDown] = useState(false);

  useEffect(() => () => void pipe.get()?.close(), [pipe]);

  const receive = (bytes: Uint8Array) => s.receive(bytes);
  const closed = (error?: string) => {
    pipe.set(undefined);
    setKind(undefined);
    setMessage(error ? `connection lost: ${error}` : "disconnected");
    s.reset();
  };

  // The simulated plotter takes a job's bytes at the average rate the simulation predicts.
  const simRate = () => {
    const a = activeRef.current;
    if (!a || s.state === "ready") return SIM_COMMAND_RATE;
    return Math.max(50, a.job.bytes.length / Math.max(a.sim.duration, 1e-3));
  };

  const connect = async (k: "usb" | "sim") => {
    await pipe.get()?.close();
    setActive(undefined);
    s.reset();
    setMessage(undefined);
    setPenDown(false);
    setOffset({ x: 0, y: 0 });
    try {
      pipe.set(k === "usb" ? await openWebSerial(receive, closed) : openSimulated(receive, simRate));
      setKind(k);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const jogBy = (dxMm: number, dyMm: number, params: MachineParams) => {
    const j = jog(dxMm, dyMm, params);
    if (s.command(j.bytes)) setOffset((o) => ({ x: o.x + j.steps.x, y: o.y + j.steps.y }));
  };

  return {
    state: kind ? s.state : ("disconnected" as const),
    error: s.error,
    message,
    kind,
    capacity: s.capacity,
    active,
    progress: s.progress(),
    offset,
    penDown,

    connect,
    async disconnect() {
      await pipe.get()?.close();
      pipe.set(undefined);
      setKind(undefined);
      s.reset();
    },
    /** Emergency stop: reboot the board. Everything in flight is lost; the pen stays where it is. */
    async reset() {
      setActive(undefined);
      s.reset();
      setPenDown(false);
      await pipe.get()?.reset();
    },

    jog: jogBy,
    /** Moves back to where the offset was zeroed. */
    home(params: MachineParams) {
      if (offset.x || offset.y) jogBy(-offset.x / params.steps_per_mm_x, -offset.y / params.steps_per_mm_y, params);
    },
    zero() {
      setOffset({ x: 0, y: 0 });
    },
    togglePen() {
      if (s.command(PEN_TOGGLE_BYTES)) setPenDown((d) => !d);
    },
    motorsOff() {
      s.command(MOTORS_OFF_BYTES);
    },

    start(job: ActiveJob) {
      if (penDown) {
        setMessage("lift the pen before starting a job");
        return;
      }
      if (s.startJob(job.job)) setActive(job);
    },
    /** Forget a finished job, so the view goes back to the program being edited. */
    dismiss() {
      if (s.state === "ready" || !pipe.get()) setActive(undefined);
    },
    pause: (mode: "pen-up" | "now") => s.pause(mode),
    resume: () => s.resume(),
    stop: () => s.stop(),
  };
}

export type Plotter = ReturnType<typeof usePlotter>;
