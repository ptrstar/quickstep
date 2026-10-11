import type { Drawing } from "./geometry";

/** Lines out and back from the centre at evenly spaced angles: shows cornering at every angle. */
export function star(radius = 40, rays = 16): Drawing {
  return Array.from({ length: rays }, (_, i) => {
    const a = (2 * Math.PI * i) / rays;
    const tip = { x: radius + radius * Math.cos(a), y: radius + radius * Math.sin(a) };
    return [{ x: radius, y: radius }, tip, { x: radius, y: radius }];
  });
}

/** One continuous Archimedean spiral of short segments: shows the lookahead on dense paths. */
export function spiral(turns = 12, spacing = 3, segmentLength = 1): Drawing {
  const stroke = [];
  const maxR = turns * spacing;
  for (let a = 0; ; ) {
    const r = (spacing * a) / (2 * Math.PI);
    stroke.push({ x: maxR + r * Math.cos(a), y: maxR + r * Math.sin(a) });
    if (r >= maxR) break;
    // step the angle so consecutive points are about segmentLength apart
    a += segmentLength / Math.max(r, segmentLength);
  }
  return [stroke];
}

/** Zigzags with increasingly sharp corners, left to right. */
export function zigzags(width = 80, rows = 6): Drawing {
  return Array.from({ length: rows }, (_, row) => {
    const teeth = 2 + row * 3;
    const y0 = row * 14;
    return Array.from({ length: teeth * 2 + 1 }, (_, i) => ({ x: (width * i) / (teeth * 2), y: y0 + (i % 2) * 10 }));
  });
}

export const DEMOS: Record<string, () => Drawing> = { star, spiral, zigzags };
