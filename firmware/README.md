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
