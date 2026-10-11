# QuickStep firmware

ATmega328P (Arduino Uno) + CNC Shield V3. Streams QUICKSTEP v2 over USB serial (see `../protocol/SPEC.md`).

| Path | Contents |
|------|----------|
| `lib/quickstep` | Decoder, parameters, lookahead planner, machine. Plain C++, no Arduino dependency. |
| `src/main.cpp` | Hardware layer (serial, step generation). Placeholder until stage 5. |
| `test/` | Native tests: protocol vectors and planner vectors from the web simulator. |

```sh
brew install platformio
pio test -e native          # core tests on this computer
pio run -e uno              # build, prints flash/RAM use
pio run -e uno -t upload    # flash the plotter
```

The planner must match `web/src/core/sim` exactly. After changing the motion model in the simulator,
regenerate the vectors with `UPDATE_VECTORS=1 npm test` in `web/` and make these tests pass again.

## Hardware layer (`src/`)

- `uart.cpp`: 250000 baud, receive interrupt into a 255-byte ring, credit bytes back to the host.
  Arduino's `Serial` must not be used anywhere (it would claim the same interrupt).
- `stepper.cpp`: Timer1 in CTC mode at 2 MHz. Each interrupt runs `qs::StepCore::tick()`, pulses the
  step pins together and programs the next period. The drivers stay disabled until the first move,
  so the carriage can be positioned by hand after power-on.
- `config.h`: pins and `DIR_INVERT` if an axis runs the wrong way.

## First run on the plotter (checklist)

1. `pio test -e native`, then `pio run -e uno -t upload`.
2. Open the port at 250000 baud: the board answers `A5 02 0F`.
3. Jog: send `0E 28 00` (MOVE 40, 0 at int8, then END). X should move +8 mm and the board sends a
   credit byte `03`. Repeat for Y with `0E 00 28`. Flip `DIR_INVERT` bits if needed.
4. Pen: send `30` (toggle, toggle, END): pen goes down and up. Flip the Z bit if it goes the wrong way.
5. Then stream real jobs from the web app (stage 6).
