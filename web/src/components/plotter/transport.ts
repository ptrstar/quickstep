/// <reference types="w3c-web-serial" />
import { FakeDevice } from "@/core/link/fakeDevice";

/** A byte pipe to the plotter. Writes are queued in order; `reset` reboots the board. */
export type Transport = {
  write(bytes: Uint8Array): void;
  reset(): Promise<void>;
  close(): Promise<void>;
};

export const webSerialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * USB serial via the Web Serial API (Chrome, Edge). Opening the port resets the Uno, which then
 * sends its hello.
 */
export async function openWebSerial(onData: (bytes: Uint8Array) => void, onClose: (error?: string) => void): Promise<Transport> {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 250000, bufferSize: 4096 });
  const writer = port.writable!.getWriter();
  const reader = port.readable!.getReader();
  let closing = false;
  let chain = Promise.resolve();

  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onData(value);
      }
    } catch (e) {
      if (!closing) onClose(String(e));
      return;
    } finally {
      reader.releaseLock();
    }
    if (!closing) onClose();
  })();

  return {
    write(bytes) {
      const copy = bytes.slice(); // the caller may reuse its buffer
      chain = chain.then(() => writer.write(copy)).catch((e) => onClose(String(e)));
    },
    async reset() {
      // Dropping DTR resets the Uno, like the auto-reset on opening the port.
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(100);
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    },
    async close() {
      closing = true;
      await chain.catch(() => {});
      await reader.cancel().catch(() => {});
      writer.releaseLock();
      await port.close();
    },
  };
}

/**
 * A simulated plotter in the browser: the fake device (same buffer, decoder and credits as the
 * firmware), taking bytes at `rate()` bytes per second. Lets the whole streaming workflow run
 * without hardware.
 */
export function openSimulated(onData: (bytes: Uint8Array) => void, rate: () => number): Transport {
  let device = new FakeDevice();
  let budget = 0;
  let last = performance.now();
  const flush = () => {
    const out = device.takeOutput();
    if (out.length) onData(out);
  };
  const boot = () => {
    device = new FakeDevice();
    setTimeout(() => {
      device.boot();
      flush();
    }, 300);
  };
  const timer = setInterval(() => {
    const now = performance.now();
    budget = Math.min(budget + ((now - last) / 1000) * rate(), 256);
    last = now;
    const n = Math.floor(budget);
    if (n > 0 && device.buffered > 0) {
      const before = device.buffered;
      device.consume(n);
      budget -= before - device.buffered;
      flush();
    }
  }, 30);
  boot();
  return {
    write(bytes) {
      device.receive(bytes);
      flush();
    },
    async reset() {
      boot();
    },
    async close() {
      clearInterval(timer);
    },
  };
}
