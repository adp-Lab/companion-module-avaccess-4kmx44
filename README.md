# companion-module-avaccess-4kmx44

Bitfocus Companion module for the AV Access 4KMX44-H2 4x4 HDMI matrix, controlled over its Telnet/IP API.

No native Companion module exists for this device yet ([bitfocus/companion-module-requests#1488](https://github.com/bitfocus/companion-module-requests/issues/1488), [#1964](https://github.com/bitfocus/companion-module-requests/issues/1964)) — this fills that gap.

## Status

**v1.1, live-verified against real hardware.** 83 tests passing (`npm test`).

- **13 actions:** switch input→output, reboot, save/recall hardware scene, audio mute (set + toggle, per-output and all), HDCP (set + toggle), output downscaler (set + toggle), CEC display power, input EDID preset.
- **6 feedbacks**, all **RED** when active: routing live, scene matches live routing, output muted (per-output + all-outputs), HDCP enabled, downscaler on.
- **Presets:** Routing (4×4 grid), Scenes (long-press Save 1-3 / Load 1-3), Mute, HDCP, Scaler, CEC, System — pre-wired with the matching action + feedback.
- **30 variables:** per-output/input routing, mute, HDCP, scaler, EDID labels, active scene, plus static device info (model, firmware, IP, IP mode). See `companion/HELP.md` for the full list.

## Installing (no development setup needed)

1. Download the latest `avaccess-4kmx44-*.tgz` from this repo's [Releases](../../releases) page.
2. In Companion: **Modules** → **Import module** → select the downloaded `.tgz`.
3. Add a new connection: search for "AV Access 4KMX44-H2", set the matrix's IP and port (default 23).

This bundle is plain JS with no native dependencies — the same file works on Mac, Windows, and Linux installs of Companion.

## Development

```bash
npm install
npm test
```

Design spec: [`docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md`](docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md)
Implementation plans: [`docs/superpowers/plans/`](docs/superpowers/plans)

### Building a distributable bundle

```bash
npm install --save-dev @companion-module/tools@latest
node_modules/.bin/companion-module-build
```

Produces `avaccess-4kmx44-<version>.tgz` — a self-contained bundle (single `main.js`, no `node_modules`) importable via Companion's **Import module**, no dev mode or clone required.

### Loading into Companion's developer mode (for editing source)

1. Open Companion → the launcher window → settings cog icon → **Developer** section
2. Set the Developer Modules **Path** to a folder that contains a *real copy* of this repo as a subfolder — **not a symlink**: Companion 4.3 sandboxes dev modules to their own folder via Node's permission model, and a symlink escapes it (`Access to this API has been restricted` → module never starts)
3. Enable **"Enable Developer Modules"**
4. Restart Companion's GUI — "AV Access 4KMX44-H2" should appear in the Add Connection list
5. Add the connection, set Target IP/Port to a real matrix
6. After any source change, re-copy the repo into the dev folder (e.g. `rsync -a --delete --exclude='.git' --exclude='test' ./ ~/companion-dev-modules/companion-module-avaccess-4kmx44/`) and restart the connection
