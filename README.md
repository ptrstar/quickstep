# QuickStep Plotter

QuickStep is a lightweight, high-speed motion control system for an Arduino-based pen plotter:

- **Frontend** – a node-graph editor that turns raster images and fonts into QuickStep programs, with a simulator.
- **QuickStep format** – a compact, G-code-like binary command format (2-bit opcodes, variable int size relative moves).
- **Firmware** – streams QuickStep over USB serial and runs it with lookahead path planning on an ATmega328P.

## Status

`v2` is a rewrite in progress:

| Path | Contents |
|------|----------|
| `legacy/pipenet` | v1 frontend (open `legacy/pipenet/index.html` served from the parent folder) |
| `legacy/HSDriver` | v1 firmware (program baked into PROGMEM) |
| `legacy/samples` | v1 programs, used as test fixtures |

The new `protocol/`, `firmware/` and `web/` folders arrive stage by stage.
