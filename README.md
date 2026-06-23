# companion-module-avaccess-4kmx44

Bitfocus Companion module for the AV Access 4KMX44-H2 4x4 HDMI matrix, controlled over its Telnet/IP API.

No native Companion module exists for this device yet ([bitfocus/companion-module-requests#1488](https://github.com/bitfocus/companion-module-requests/issues/1488), [#1964](https://github.com/bitfocus/companion-module-requests/issues/1964)) — this fills that gap.

Design spec: [`docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md`](docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md)
Implementation plan: [`docs/superpowers/plans/2026-06-23-avaccess-4kmx44-module-implementation.md`](docs/superpowers/plans/2026-06-23-avaccess-4kmx44-module-implementation.md)

## Status

v1 implemented and fully tested against a simulated matrix (`npm test`). **Not yet tested against the real device** — the matrix is still in transit. No live feedback (button highlighting) yet; see the spec's "Open questions" section for what's still unconfirmed without real hardware.

## Development

```bash
npm install
npm test
```

## Loading into Companion's developer mode

1. Open Companion → the launcher window → settings cog icon → **Developer** section
2. Set the Developer Modules **Path** to a folder that contains this repo as a subfolder (the path must point at the *parent* directory, not this repo itself)
3. Enable **"Enable Developer Modules"**
4. Restart Companion's GUI — "AV Access 4KMX44-H2" should appear in the Add Connection list
5. Add the connection, set Target IP/Port to a real or simulated matrix
6. Drag in a preset from the "Routing" or "Convenience" category, confirm it appears with the right label
