import { describe, expect, it } from "vitest";
import { compile } from "../../quickstep/compile";
import { DEFAULT_PARAMS } from "../../quickstep/params";
import { simulate } from "../../sim/simulate";
import { generative, rosette } from "../defaults";
import { GraphSession } from "../session";
import { registry } from ".";
import { framed, harmonograph, repeat, spirograph, waveSpiral, whirl } from "./generative";

const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("spirograph", () => {
  const base = { ring: 96, wheel: 52, pen: 0.8, outside: false, resolution: 240 };

  it("closes on itself", () => {
    const s = spirograph(base);
    expect(s[0].x).toBeCloseTo(s.at(-1)!.x, 6);
    expect(s[0].y).toBeCloseTo(s.at(-1)!.y, 6);
  });

  it("reaches R - r + d inside and R + r + d outside", () => {
    expect(Math.max(...spirograph(base).map(radius))).toBeCloseTo(96 - 52 + 0.8 * 52, 1);
    expect(Math.max(...spirograph({ ...base, outside: true }).map(radius))).toBeCloseTo(96 + 52 + 0.8 * 52, 1);
  });

  it("with the pen at the centre it is a circle", () => {
    for (const p of spirograph({ ...base, pen: 0 })) expect(radius(p)).toBeCloseTo(44, 9);
  });

  it("trips = wheel / gcd(ring, wheel)", () => {
    // 96 and 52 share 4, so 13 trips; 97 and 52 share nothing, so 52 trips (4× longer)
    expect(spirograph({ ...base, ring: 97 }).length / spirograph(base).length).toBeCloseTo(52 / 13, 1);
  });
});

describe("harmonograph", () => {
  const base = { fx1: 2, fx2: 3.003, fy1: 3, fy2: 2.002, phase: 1.2, damping: 0.006, duration: 400, resolution: 30 };
  it("dies away with damping and stays bounded without", () => {
    const s = harmonograph(base);
    const early = Math.max(...s.slice(0, 500).map(radius));
    const late = Math.max(...s.slice(-500).map(radius));
    expect(late).toBeLessThan(0.35 * early);
    for (const p of harmonograph({ ...base, damping: 0 })) expect(radius(p)).toBeLessThanOrEqual(2 * Math.SQRT2 + 1e-9);
  });
});

describe("waveSpiral", () => {
  it("without waves it is an Archimedean spiral: radius = turns so far", () => {
    const s = waveSpiral({ turns: 10, waves: 7, amplitude: 0, twist: 0.1, resolution: 100 });
    s.forEach((p, i) => expect(radius(p)).toBeCloseTo((10 * i) / (s.length - 1), 9));
  });
});

describe("whirl", () => {
  it("each polygon's corners lie the step along the previous one's edges", () => {
    const w = whirl({ corners: 5, levels: 6, step: 0.1, rotation: 0 });
    expect(w).toHaveLength(6);
    for (let l = 1; l < w.length; l++) {
      for (let k = 0; k < 5; k++) {
        const a = w[l - 1][k];
        const b = w[l - 1][k + 1];
        expect(w[l][k].x).toBeCloseTo(a.x + 0.1 * (b.x - a.x), 9);
        expect(w[l][k].y).toBeCloseTo(a.y + 0.1 * (b.y - a.y), 9);
      }
      expect(w[l][0]).toEqual(w[l][5]);
    }
  });
});

describe("repeat and framing", () => {
  it("copy k is the original turned by k × angle and scaled by scale^k around the centre", () => {
    const lines = { width: 20, height: 20, strokes: [[{ x: 20, y: 10 }]] }; // 10 right of the centre
    const out = repeat(lines, { copies: 4, rotate: 90, scale: 0.5 });
    expect(out.strokes).toHaveLength(4);
    const c = { x: out.width / 2, y: out.height / 2 };
    const rel = out.strokes.map((s) => ({ x: s[0].x - c.x, y: s[0].y - c.y }));
    expect(rel[1].x).toBeCloseTo(0);
    expect(rel[1].y).toBeCloseTo(5);
    expect(rel[2].x).toBeCloseTo(-2.5);
    expect(rel[3].y).toBeCloseTo(-1.25);
  });

  it("framed lines start at the padding and fit their frame", () => {
    const l = framed([spirograph({ ring: 60, wheel: 23, pen: 1.1, outside: true, resolution: 100 })]);
    for (const p of l.strokes.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(l.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(l.height);
    }
  });
});

describe("generative presets", () => {
  it.each([
    ["Spirograph", () => generative(registry, "spirograph")],
    ["Harmonograph", () => generative(registry, "harmonograph")],
    ["Wave spiral", () => generative(registry, "waveSpiral")],
    ["Whirl", () => generative(registry, "whirl")],
    ["Rosette", () => rosette(registry)],
  ])("%s plots on A6 without any input", (name, make) => {
    const r = new GraphSession(registry).run(make());
    expect(r.status.filter(([, s]) => s.state !== "ok")).toEqual([]);
    const d = r.drawing!;
    for (const p of d.strokes.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(5.9);
      expect(p.x).toBeLessThanOrEqual(99.1);
    }
    const sim = simulate(compile(d.strokes, DEFAULT_PARAMS), DEFAULT_PARAMS);
    console.info(`${name}: ${d.strokes.length} strokes, ${(sim.duration / 60).toFixed(1)} min`);
  });
});
