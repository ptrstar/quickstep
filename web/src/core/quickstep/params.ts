// Machine parameters (SPEC §6). Ids and defaults must match the firmware.

export const PARAMS = {
  steps_per_mm_x: { id: 0x01, default: 5.0 },
  steps_per_mm_y: { id: 0x02, default: 200 / 42 },
  microsteps_x: { id: 0x03, default: 8 },
  microsteps_y: { id: 0x04, default: 8 },
  microsteps_z: { id: 0x05, default: 8 },
  draw_speed: { id: 0x10, default: 20 },
  travel_speed: { id: 0x11, default: 40 },
  max_speed_x: { id: 0x12, default: 100 },
  max_speed_y: { id: 0x13, default: 60 },
  accel_x: { id: 0x14, default: 300 },
  accel_y: { id: 0x15, default: 150 },
  junction_deviation: { id: 0x16, default: 0.05 },
  pen_lift_steps: { id: 0x20, default: 20 },
  pen_speed: { id: 0x21, default: 400 },
  pen_accel: { id: 0x22, default: 4000 },
  pen_settle_ms: { id: 0x23, default: 0 },
} as const;

export type ParamName = keyof typeof PARAMS;
export type MachineParams = Record<ParamName, number>;

export const DEFAULT_PARAMS: MachineParams = Object.fromEntries(
  Object.entries(PARAMS).map(([name, p]) => [name, p.default]),
) as MachineParams;

const NAME_BY_ID = new Map<number, ParamName>(
  Object.entries(PARAMS).map(([name, p]) => [p.id, name as ParamName]),
);

export function paramName(id: number): ParamName | undefined {
  return NAME_BY_ID.get(id);
}
