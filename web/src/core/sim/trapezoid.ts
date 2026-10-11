/**
 * Speed profile of one segment (SPEC §7): accelerate at `a` from the entry speed, cruise at the
 * nominal speed, decelerate at `a` to the exit speed. Becomes a triangle when the segment is too
 * short to reach the nominal speed.
 */
export type Trapezoid = {
  length: number;
  accel: number;
  entry: number;
  exit: number;
  /** Highest speed reached (nominal speed, or the triangle peak). */
  peak: number;
  accelTime: number;
  cruiseTime: number;
  decelTime: number;
  accelDist: number;
  cruiseDist: number;
  duration: number;
};

export function trapezoid(length: number, accel: number, entry: number, exit: number, nominal: number): Trapezoid {
  let peak = nominal;
  let accelDist = (nominal * nominal - entry * entry) / (2 * accel);
  let decelDist = (nominal * nominal - exit * exit) / (2 * accel);
  if (accelDist + decelDist > length) {
    // Triangle: meet where the acceleration and deceleration ramps cross.
    peak = Math.sqrt((2 * accel * length + entry * entry + exit * exit) / 2);
    accelDist = Math.max(0, (peak * peak - entry * entry) / (2 * accel));
    decelDist = Math.max(0, length - accelDist);
  }
  const cruiseDist = Math.max(0, length - accelDist - decelDist);
  const accelTime = (peak - entry) / accel;
  const decelTime = (peak - exit) / accel;
  const cruiseTime = peak > 0 ? cruiseDist / peak : 0;
  return {
    length,
    accel,
    entry,
    exit,
    peak,
    accelTime,
    cruiseTime,
    decelTime,
    accelDist,
    cruiseDist,
    duration: accelTime + cruiseTime + decelTime,
  };
}

/** Distance travelled and speed `t` seconds into the profile (clamped to the profile). */
export function sample(p: Trapezoid, t: number): { distance: number; speed: number } {
  const { accel: a, entry, peak } = p;
  if (t <= 0) return { distance: 0, speed: entry };
  if (t < p.accelTime) return { distance: entry * t + (a * t * t) / 2, speed: entry + a * t };
  t -= p.accelTime;
  if (t < p.cruiseTime) return { distance: p.accelDist + peak * t, speed: peak };
  t -= p.cruiseTime;
  if (t < p.decelTime) {
    return { distance: p.accelDist + p.cruiseDist + peak * t - (a * t * t) / 2, speed: peak - a * t };
  }
  return { distance: p.length, speed: p.exit };
}
