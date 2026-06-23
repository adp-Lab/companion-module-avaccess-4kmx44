# AV Access 4KMX44-H2 Companion Module — Design Spec

## Context

The AV Access 4KMX44-H2 is a 4x4 HDMI matrix with S/PDIF audio breakout, controllable over IR, RS232, and IP (Telnet on port 23, plain-text commands, plus a Web UI). No native Bitfocus Companion module exists for it — two community feature requests are open/unresolved on `bitfocus/companion-module-requests` (#1488, #1964). The current workaround uses Companion's generic `generic-tcp-udp` module plus a Trigger/Custom-Variable polling hack for state feedback (documented in `av-access-4kmx44-companion-setup.html` in this workspace). This module replaces that workaround.

The matrix has not arrived yet — André ordered it but it's still in transit. All testing until then must happen against a fake/simulated device, not real hardware. André's planned live-show use is IN1+IN2 (4K@59.94, Main+Backup) → OUT1, IN3+IN4 (1080p@59.94, Main+Backup) → OUT3, but the module itself is general-purpose, not hardcoded to that routing.

André's stated priority: get this as close to 100% correct as possible before the hardware arrives, because the real install happens on a tight schedule with little tolerance for live debugging.

## Goals

- A real, dedicated Companion module (not the generic-TCP-UDP workaround) covering: switching, reboot, hardware scene save/recall, audio mute, HDCP toggle, downscaler toggle, CEC display power, and EDID presets.
- v1 ships **actions and presets only — no live feedback (button highlighting) yet**. Feedback needs a real device to confirm correctness against, per André's explicit instruction.
- Architect the connection/parsing layer so feedback can be added in v1.1 without restructuring anything in v1.
- High confidence before hardware arrives, via automated tests against a fake TCP server standing in for the matrix.

## Non-goals (explicitly out of scope for this module)

- **Factory reset** (`RESET`) — one misclick during a show would wipe EDID/network/password config. Deliberately not exposed as an action.
- **Network/static IP configuration** (`SET IPADDR`, `SET IP MODE`) — setup-time only, risky to expose as a button.
- **Firmware upgrade** (`UPG`) — requires file staging, not a live-trigger action.
- **EDID Write / EDID file upload** — Web-UI-only mechanism (browse + upload a `.bin` file); no telnet equivalent is documented.
- **`AUTOCEC_FN` / `AUTOCEC_D`** (automatic display power-off after no signal, with configurable delay) — not requested; only manual CEC power on/off was asked for.
- **Live feedback** (button state reflecting actual device state) — deferred to v1.1, pending hardware confirmation. The state-tracking plumbing is built now; the visible feedback wiring is not.

## Architecture

### Repo & tooling

- `adp-Lab/companion-module-avaccess-4kmx44` (private GitHub repo)
- Scaffolded from the official `bitfocus/companion-module-template` (plain JavaScript variant, not the TypeScript one) — no build/transpile step, so editing `src/` and Companion's developer-mode hot-reload can iterate immediately. Matches the project's general "no frameworks, keep it simple" preference, and matters more than usual right now since we're iterating against a fake device with no hardware feedback loop to slow us down anyway.
- manifest `id`: `avaccess-4kmx44`, `manufacturer`: "AV Access", `license`: MIT (keeps it submission-ready to Bitfocus later without restructuring, even though the repo stays private for now).

### File layout

```
companion-module-avaccess-4kmx44/
├── companion/
│   ├── manifest.json
│   └── HELP.md
├── src/
│   ├── main.js              — config fields (host/port), connection lifecycle, line-buffered receive handler, in-memory state model
│   ├── commands.js          — pure command-string builders + parseDeviceReply() (fully unit-testable, no I/O)
│   ├── actions.js           — all 9 action definitions
│   ├── presets.js           — generated preset buttons
│   └── feedbacks.js         — present but empty in v1
├── test/
│   ├── commands.test.js               — unit tests for every builder + parser case
│   └── fake-matrix.integration.test.js — fake TCP server + Companion HTTP API, end-to-end per action
├── docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md   (this file)
├── package.json, README.md, LICENSE, .gitignore
```

### Connection handling (`main.js`)

- TCP socket to `{host}:{port}`, default port 23.
- **Line-buffered receive handler**: accumulate incoming bytes in a buffer, split on `\r\n`, process each complete line, retain any partial trailing fragment for the next chunk. This is a deliberate correctness fix versus the generic-tcp-udp module's behavior (which stores whatever raw bytes arrived in one `data` event, verbatim, including trailing `\r\n` — the bug found and fixed earlier in the Companion-side workaround). Proper line-buffering also means the multi-line `GET MP all` reply is handled by the exact same code path as every single-line reply, with no special-casing.
- **In-memory state model**, generalized beyond just routing, populated by `parseDeviceReply()` on every line — regardless of whether the line was the echo of our own command or (later, in v1.1) an unsolicited push or poll reply:

  ```js
  this.state = {
    routing:   { 1: null, 2: null, 3: null, 4: null },  // output -> input
    audioMute: { 1: null, 2: null, 3: null, 4: null },  // output -> bool
    hdcp:      { 1: null, 2: null, 3: null, 4: null },  // input -> bool
    scaler:    { 1: null, 2: null, 3: null, 4: null },  // output -> bool
    cecPower:  { 1: null, 2: null, 3: null, 4: null },  // output -> bool
  }
  ```

### `commands.js` — pure, unit-testable functions

| Function | Example output |
|---|---|
| `buildSwitchCommand(input, output)` | `SET SW hdmiin1 hdmiout1\r\n` |
| `buildRebootCommand()` | `REBOOT\r\n` |
| `buildSaveSceneCommand(slot)` | `SAVE PRESET 1\r\n` |
| `buildRecallSceneCommand(slot)` | `RESTORE PRESET 1\r\n` |
| `buildMuteCommand(output, state)` | `SET MUTE audioout1 on\r\n` (output may be `1-4` or `all`) |
| `buildHdcpCommand(input, state)` | `SET HDCP_S hdmiin1 off\r\n` |
| `buildScalerCommand(output, state)` | `SET SCALER hdmiout1 on\r\n` (output may be `1-4` or `all`) |
| `buildCecPowerCommand(output, state)` | `SET CEC_PWR hdmiout1 on\r\n` (output may be `1-4` or `all`) |
| `buildEdidCommand(input, presetId)` | `SET EDID hdmiin1 05\r\n` (presetId 1-12) |
| `parseDeviceReply(line)` | `{ keyword, target, value } \| null` — recognizes `SW`, `MP`, `MUTE`, `HDCP_S`, `SCALER`, `CEC_PWR`, `PRESET`, `REBOOT`, `RESET` reply shapes |

All option values (input/output numbers, on/off, scene slot, EDID preset id) are validated against the documented ranges before building a command string.

### `actions.js` — 9 actions

1. **Switch Input to Output** — dropdowns: Input (1-4), Output (1-4)
2. **Reboot Matrix** — no options
3. **Save Hardware Scene** — dropdown: Slot (1-8 — see Open Questions)
4. **Recall Hardware Scene** — dropdown: Slot (1-8)
5. **Set Audio Mute** — dropdowns: Output (1-4, all), State (on/off)
6. **Set HDCP Support** — dropdowns: Input (1-4), State (on/off) — documented as a likely way to force a source to re-handshake (useful for stuck Mac sources), though AV Access doesn't state the mechanism explicitly
7. **Set Output Downscaler** — dropdowns: Output (1-4, all), State (on/off) — "on" already behaves as auto-downscale-when-a-1080p-display-is-detected per the manual; there's no separate third "auto" value in the documented API
8. **Set CEC Display Power** — dropdowns: Output (1-4, all), State (on/off)
9. **Set Input EDID** — dropdowns: Input (1-4), Preset (12 named options: 4K HDR variants at various audio channel counts, 1080p@60Hz, Smart EDID, copy-EDID-from-output 1-4)

### `presets.js`

- 16 routing presets (4×4 grid), labelled `IN{x}→OUT{y}`, each with hardcoded `options: { input, output }` — no need for the expression/local-variable preset mechanism the Bitfocus docs show elsewhere, since our values are fixed, not dynamic.
- A small set of convenience presets for the other actions: Reboot, Mute All, Unmute All, Recall Scene 1. The full action set remains available manually on any blank button regardless of whether a preset exists for it.

### `feedbacks.js`

- File exists per the template's recommended layout, but registers nothing in v1 (`setFeedbackDefinitions({})`). The state model in `main.js` is already populated and tested; turning it into visible button feedback later is purely additive — no changes needed to `actions.js`, `presets.js`, or the connection logic.

## Testing strategy

- **Unit tests** (`test/commands.test.js`): every command builder against all valid option combinations (16 switch combos, both states for each on/off action, all 8 scene slots, all 12 EDID presets); `parseDeviceReply()` against every documented example string from the API doc — including the multi-line `GET MP all` reply — plus garbage/unrelated input → `null`.
- **Integration test** (`test/fake-matrix.integration.test.js`): a local Node `net` TCP server stands in for the matrix on a free port. Companion's HTTP API triggers every preset and every action; the test asserts the fake server received the exact expected bytes for all 9 action families, and that canned fake replies update the internal state model correctly — so the feedback foundation is verified now, against a fake device, before the real one exists.
- No hardware-in-the-loop tests yet. Verifying against the real matrix is an explicit go-live checklist item once it arrives, not part of this spec.

> **Post-build reconciliation (2026-06-24):** the single `fake-matrix.integration.test.js` sketched above was implemented as a cleaner split — `test/tcp-pipeline.integration.test.js` (TCPHelper receive → parse → state) and `test/actions-tcp.integration.test.js` (all 9 actions send exact bytes over a real socket) — plus `actions.test.js`, `presets.test.js`, `main.test.js`, and `manifest.test.js`. 36 tests total, all green. Also added after the final review: the required top-level manifest `"type": "connection"` (v2 SDK schema requirement). Spec validation note (line ~86) "all option values validated against documented ranges" is satisfied by the Companion dropdown choices, not by range-checks inside the pure builders.

## Open questions / anticipated-not-confirmed

These are flagged honestly rather than guessed at, consistent with how the rest of this project has been verified:

- **Maximum hardware scene slot count** — the API doc shows `{1,2,3...}` with no stated ceiling. Defaulting the UI dropdown to 1-8; confirm the real limit once the Web UI's own preset list is visible.
- **Whether toggling HDCP forces a genuine re-handshake** — inference from how HDCP/EDID negotiation generally works, not a mechanism AV Access documents explicitly.
- **Whether EDID changes take effect live or need a hotplug/replug** — not stated; sources often cache EDID read at connect time.
- **Real switching latency / whether it's ever "seamless"** — the manual makes no seamless-switching claim anywhere, and this is a budget-tier device, so a brief HDCP/sync blip per switch is the expectation, not a confirmed measurement.
- **Whether the matrix's telnet server accepts more than one simultaneous connection** — relevant only once real feedback polling is added in v1.1, not for v1.

## Next step

Hand off to the `writing-plans` skill to produce a concrete, ordered implementation plan (scaffold from template, write `commands.js` + tests first, then `actions.js`/`presets.js`, then the integration test, then README/HELP.md).
