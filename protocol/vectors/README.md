# Test vectors

Shared by the web encoder/decoder and the firmware decoder. Both implementations must pass all of them.

- `encoding.json`: instruction list ⇄ bytes (hex, space separated). Encoding is deterministic, so test both
  directions. Instructions: `pen`, `size{bits}`, `move{dx,dy}`, `end`, `nop`, `pause`, `resume`,
  `set_param{id,value}`, `dwell{ms}`, `motors_off`, `reset_params`.
- `errors.json`: bytes → error code the decoder must report (see SPEC §5).
- `../../legacy/samples/handdrawing.v1.txt`: real v1 program, valid v2. Decodes completely (22210 bytes) into
  86 strokes / 17733 moves, ends at (0, 0) with the pen up.

Planner vectors (segments → entry speeds, job time) are added with the firmware planner.
