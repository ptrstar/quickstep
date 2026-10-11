# QUICKSTEP v2

QUICKSTEP is a compact binary motion format for the QuickStep pen plotter. v2 streams a program over
USB serial instead of baking it into flash, and adds extended commands for parameters, pause/resume
and dwell. Every valid v1 program is also a valid v2 program.

This document is normative for the encoder (`web/`), the decoder and planner (`firmware/`) and the
simulator (`web/`). Shared test vectors live in `protocol/vectors/`.

## 1. Byte stream

A program is a sequence of bytes. The decoder holds an **opcode register** of four 2-bit **slots**.

- `fetch_slot()`: if the register is empty, read the next byte from the stream into it. Then return its
  lowest two bits and shift the register right by 2. Slots are consumed LSB first.
- `read_data(n)`: read the next `n` bytes from the stream.

Data bytes are read *at the moment an instruction needs them*. So an opcode byte is followed by the
data of the instructions whose final slot it contains, in slot order, and then by the next opcode byte.

Multi-byte integers and floats are little-endian. Floats are IEEE 754 binary32.

## 2. Instructions

| Slots | Name | Data | Effect |
|-------|------|------|--------|
| `00` | PEN | – | Toggle pen (up ⇄ down). Pen is up at power-on. |
| `01 00` | SIZE4 | – | Moves use 4-bit components. |
| `01 01` | SIZE8 | – | Moves use 8-bit components (default). |
| `01 10` | SIZE16 | – | Moves use 16-bit components. |
| `01 11` | EXT | 1 + payload | Extended command (section 3). |
| `10` | MOVE | 1, 2 or 4 | Relative move by (dx, dy) full steps. |
| `11` | END | – | End of job (section 4). |

MOVE data, by current size (all components two's complement):

| Size | Bytes | Layout |
|------|-------|--------|
| 4 | 1 | low nibble = dx, high nibble = dy (each −8…7) |
| 8 | 2 | dx (int8), dy (int8) |
| 16 | 4 | dx (int16 LE), dy (int16 LE) |

Units are **full motor steps of each axis**. The axes have different steps/mm, so the encoder converts
mm → steps per axis. The firmware multiplies by the per-axis microstep parameter. A MOVE of (0, 0) is
legal and does nothing.

## 3. Extended commands

`EXT` reads one data byte, the extended opcode, then a fixed-length payload.

| Opcode | Name | Payload | Effect |
|--------|------|---------|--------|
| `0x00` | NOP | – | Nothing. |
| `0x01` | PAUSE | – | Barrier. Then wait until the next instruction, which must be RESUME. |
| `0x02` | RESUME | – | Continue after PAUSE. Legal only directly after PAUSE. |
| `0x03` | SET_PARAM | id u8, value f32 | Barrier. Then set parameter `id` (section 6). |
| `0x04` | DWELL | ms u16 | Barrier. Then wait `ms` milliseconds. |
| `0x05` | MOTORS_OFF | – | Barrier. Then disable all drivers. Re-enabled by the next motion. |
| `0x06` | RESET_PARAMS | – | Barrier. Then restore all parameters to defaults. |

A **barrier** means that all queued motion is executed and comes to a full stop before the command
takes effect. The planner treats a barrier as a point where speed must be zero, so stopping is always
smooth. The machine runs out the buffered path and never stops abruptly.

Pausing from the host: append `PAUSE`, then stop sending. To continue, send `RESUME` and the rest of the
program. The frontend can place the PAUSE right after the next pen-up toggle, so the pen waits lifted.

## 4. END and jobs

`END` is a barrier. After it the decoder:

- discards the remaining slots in the opcode register (they are padding),
- resets the move size to 8.

Pen state and parameters are kept. A job should end with the pen up. Short commands such as jogging
are just tiny jobs, e.g. `MOVE(40, 0), END`.

Encoders pad unused slots with `00`. That is only safe after END, so every transmission must end
with END.

Senders may also put END right after a pen lift (followed by SIZE if the move size was not 8). That
creates a group boundary where the job can be paused with the pen up. It costs nothing in time, since
PEN is already a barrier.

## 5. Serial link

- 250000 baud, 8N1 (exact on a 16 MHz ATmega328P with U2X).
- Opening the port resets the Uno. After booting, the firmware sends `0xA5 0x02 n`. `0x02` is the
  protocol version and `n` is the receive buffer size in units of 16 bytes (currently 15: 240 bytes).
  The host must wait for this. These are the first three bytes after a reset; every later byte is a
  credit or an error.
- **Flow control (device → host).** The host may have at most `16·n` bytes outstanding. Whenever the
  firmware has taken bytes out of its receive buffer, it sends one byte `k` (1…127) meaning
  "`k` more bytes are free". Reports are batched, so typically one byte per 32 bytes consumed.
  This is the only regular traffic back to the host, and it uses the otherwise idle return line.
  Without it the host would overrun the 2 KB device and bytes would be lost.
- **Errors (device → host).** One byte ≥ `0x80`, after which the firmware stops motion and ignores input
  until reset:

| Byte | Meaning |
|------|---------|
| `0x81` | Unknown extended opcode |
| `0x82` | Unknown parameter id |
| `0x83` | Instruction other than RESUME after PAUSE, or RESUME without PAUSE |
| `0x84` | Receive buffer overrun (host ignored flow control) |

The frontend's progress view is estimated from credits (bytes consumed) and the simulator timeline. The
device sends no position or status.

## 6. Parameters

All values are f32. Distances in mm, time in s, unless noted. Defaults are conservative starting points
until calibration.

| Id | Name | Default | Notes |
|----|------|---------|-------|
| `0x01` | steps_per_mm_x | 5.0 | full steps / mm (200 / 40) |
| `0x02` | steps_per_mm_y | 4.7619 | full steps / mm (200 / 42) |
| `0x03` | microsteps_x | 8 | must match driver jumpers |
| `0x04` | microsteps_y | 8 | |
| `0x05` | microsteps_z | 8 | |
| `0x10` | draw_speed | 20 | mm/s, path speed with pen down |
| `0x11` | travel_speed | 40 | mm/s, path speed with pen up |
| `0x12` | max_speed_x | 100 | mm/s, axis limit |
| `0x13` | max_speed_y | 60 | mm/s, axis limit |
| `0x14` | accel_x | 300 | mm/s², axis limit |
| `0x15` | accel_y | 150 | mm/s², axis limit (friction drive, slips) |
| `0x16` | junction_deviation | 0.05 | mm, cornering threshold δ |
| `0x20` | pen_lift_steps | 20 | full steps of Z per toggle |
| `0x21` | pen_speed | 400 | full steps/s |
| `0x22` | pen_accel | 4000 | full steps/s² |
| `0x23` | pen_settle_ms | 0 | dwell after each pen move |

## 7. Motion model

The firmware and the simulator implement the same model and are checked against shared vectors.

**Segments.** Each MOVE with non-zero length becomes a segment. Its length `L` and unit direction `u`
are in mm: `dx / steps_per_mm_x`, `dy / steps_per_mm_y`.

**Speed limits per segment.**
- Nominal speed `v_nom` is `draw_speed` if the pen is down, else `travel_speed`.
- It is capped so that no axis exceeds its limit: `v_nom ≤ min(max_speed_x / |u_x|, max_speed_y / |u_y|)`.
- Acceleration is limited the same way: `a = min(accel_x / |u_x|, accel_y / |u_y|)`. An axis with
  zero component imposes no limit.

**Junctions.** Between consecutive segments with directions `u1`, `u2`:

    s     = sin(θ/2) = |u1 + u2| / 2    (θ = angle between the two lines, π = straight on)
    v_j   = sqrt(a · δ · s / (1 − s))   (a = min of both segments' a)

`|u1 + u2| / 2` equals `sqrt((1 + u1·u2) / 2)` but stays exact in float32 near a reversal. `v_j` is capped by
both segments' `v_nom`. Straight on (`s → 1`) means no junction limit, and a full reversal
(`s = 0`) means `v_j = 0`.

**Lookahead.** The planner holds at most **20** segments. The last queued segment always ends at speed 0,
because nothing is known beyond it, and so does every segment before a barrier.

The reference behaviour assumes the host keeps the buffer full. When segment `i` starts executing, the
planner knows segments `i … i+19`, or fewer if a barrier comes first, and freezes the profile of `i`:

1. Backward pass over the window, from its last segment (exit 0) down to `i+1`:
   `b = min(v_j[k], sqrt(b² + 2·a_k·L_k))`. The result `b` is the highest exit speed of `i`.
2. Forward limit: `exit_i = min(b, sqrt(entry_i² + 2·a_i·L_i))`. `entry_i` is the frozen exit of `i−1`
   (0 after a barrier).

If the buffer runs low, the window is shorter and the device is only more cautious. The simulator
(`web/src/core/sim/planner.ts`) implements exactly this.

**Profile.** Each segment runs a trapezoid: accelerate at `a` from entry speed up to `v_nom`, cruise, then
decelerate at `a` to the exit speed. It is a triangle if too short to reach `v_nom`.

**Pen.** A PEN toggle is a barrier. Z moves `pen_lift_steps` with its own trapezoid (`pen_speed`,
`pen_accel`), then dwells `pen_settle_ms`.

**Step quantisation.** Steps are distributed along a segment with Bresenham on microsteps. The simulator
may work in continuous time, but its total job time must agree with the firmware vectors within a tolerance.
