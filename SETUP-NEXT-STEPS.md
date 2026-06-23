# AV Access 4KMX44 Companion Module — Setup & Next Steps

> Personal handoff doc. Everything needed to go live once the physical matrix arrives.
> Module is **built, tested (36/36), reviewed, and merged to `main`** — nothing left to code for v1.

---

## Paths & URLs

| What | Where |
|---|---|
| GitHub repo (private) | https://github.com/adp-Lab/companion-module-avaccess-4kmx44 |
| Local repo | `/Users/drean/Ponyhof/companion-module-avaccess-4kmx44` |
| Module id / name in Companion | `avaccess-4kmx44` / **"AV Access 4KMX44-H2"** |
| Design spec | `docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md` |
| Implementation plan | `docs/superpowers/plans/2026-06-23-avaccess-4kmx44-module-implementation.md` |
| Device manual (PDF) | `/Users/drean/Downloads/UM_4KMX44-H2-V1.0.1.pdf` |
| API command set (PDF, canonical) | https://avaccess.com/eu/wp-content/uploads/2022/03/API-Command-Set_4KMX44-H2-V1.0.0.pdf |
| Earlier workaround guide (HTML, superseded by this module — keep for protocol reference) | `/Users/drean/Ponyhof/av-access-4kmx44-companion-setup.html` |

---

## Step 1 — Connect & find the matrix

1. Power the matrix, connect its **IP Control** (RJ45) port to the same LAN/switch as the Mac running Companion.
2. Matrix is **DHCP by default** — find its IP via:
   - the front-panel menu, **or**
   - AV Access's **SmartSetGUI** discovery tool, **or**
   - your router's DHCP client list.
3. (Optional) Web UI sanity check: browse to `http://<matrix-ip>` → login **`admin` / `admin`**. Confirm the Switch page works manually before involving Companion.
4. Control port: **Telnet, TCP, port 23.** No login on the raw telnet port.

---

## Step 2 — Load the module into Companion (developer mode)

Companion can't see the module until you enable Developer Modules and point it at a folder **containing** the module as a subfolder.

> ⚠️ **CRITICAL — must be a REAL copy, NOT a symlink.** Companion 4.3 runs each dev module in a Node permission **sandbox** that only allows filesystem reads *inside the module's own folder*. A symlink that points out to the git repo escapes the sandbox → the module fails with `Access to this API has been restricted. Use --allow-fs-read` and loops on "Connection is not running" with **no config fields shown**. So copy real files in:

```bash
mkdir -p ~/companion-dev-modules/companion-module-avaccess-4kmx44
# REAL copy (incl. node_modules), excluding git/worktree/scratch — no escaping symlinks:
rsync -a --delete \
  --exclude='.git' --exclude='.claude' --exclude='.superpowers' \
  --exclude='docs' --exclude='test' --exclude='*.log' \
  /Users/drean/Ponyhof/companion-module-avaccess-4kmx44/ \
  ~/companion-dev-modules/companion-module-avaccess-4kmx44/
```
**After any code change in the repo, re-run that rsync** to refresh the dev copy, then restart the connection (or the Companion GUI). The repo stays the canonical/git-tracked source; the dev folder is a disposable real copy.
Then in Companion:
1. Launcher window → **settings cog** → **Developer** section.
2. **Developer Modules Path** → select `~/companion-dev-modules`.
3. Tick **Enable Developer Modules**.
4. Restart the Companion GUI. **"AV Access 4KMX44-H2"** appears in the Add Connection list.

> Why a dedicated folder, not `~/Ponyhof` directly: the Dev Modules Path scans every subfolder; pointing it at `~/Ponyhof` would make it scan all ~30 projects. The symlinked folder keeps it to just this module.

Hot reload: edit files in the repo and Companion restarts just this module. Force-reload by disabling/re-enabling the connection.

---

## Step 3 — Add the connection & smoke-test

1. **Connections** → add **AV Access 4KMX44-H2**.
2. Set **Target IP** = the matrix IP, **Target Port** = `23`. Status should go green/OK.
3. **Buttons** → drag in a preset from the **Routing** or **Convenience** category (16 routing + 4 convenience presets ship ready-made).
4. Press it → the matrix should switch. Confirm on the connected displays.

If a button does nothing: confirm the connection is OK (green), and that you can telnet the same command by hand (`telnet <ip> 23` → `SET SW hdmiin1 hdmiout1` + Enter).

---

## Step 4 — Confirm the "open questions" against real hardware

These were impossible to verify without the device. Check each once, note the answers back into the design spec's "Open questions" section:

- [ ] **Scene-slot ceiling** — UI offers slots 1–8; confirm how many the matrix actually supports (Web UI Preset list).
- [ ] **HDCP toggle re-handshake** — does toggling HDCP off→on on an input force a stuck Mac source to re-sync? (the field trick we're banking on).
- [ ] **EDID change live vs. replug** — does `Set Input EDID` take effect immediately, or does the source need a hotplug/reconnect?
- [ ] **Switching latency** — time a same-format switch (IN1↔IN2 4K) and a cross-format switch; expect a brief HDCP/sync blip, not a seamless cut. Plan show choreography around it.

---

## Verify-on-first-load (two findings from the v2 compliance skill)

Surfaced by the **`companion-module-review`** skill repo (a friend's link), checked against the installed SDK:

1. **FIXED — manifest `"type": "connection"`.** The `@companion-module/base` v2 manifest schema *requires* a top-level `"type": "connection"`; ours was missing it, which would have blocked loading in Companion 4.3+. Added + asserted in `manifest.test.js`. (commit `44781b5`)
2. **VERIFY on first sideload — entrypoint export form.** We use CommonJS `module.exports = ModuleInstance` (the CJS equivalent of the default export the v2 SDK expects). Almost certainly fine, but the official JS template is stale here (still shows the removed `runEntrypoint`), so there's no clean reference. **If Companion errors on the entrypoint when you load it, that's the spot** — the fix would be converting `src/main.js` to ESM `export default class ModuleInstance` + `export const UpgradeScripts = []` (and `"type":"module"` in package.json).

### Companion-dev skills installed (reusable for companion-vmix too)
- Friend's repo cloned to `/Users/drean/Ponyhof/companion-module-review` (22 skills + a report-only review system; repo has no license — kept as a local tool, not re-committed anywhere).
- Symlinked into this project at `.claude/skills` (gitignored) — so the `companion-v2-api-compliance`, `companion-actions/feedbacks/presets`, `template-compliance`, `review-scorecard` etc. skills are active when working here.
- To enable them in another Companion project: `ln -s ../../companion-module-review/.claude/skills <project>/.claude/skills`
- To run the review system against this module, or read the v2 rules: work from `/Users/drean/Ponyhof/companion-module-review` (see its README; needs PowerShell 7.6+).

## Step 5 (later) — v1.1: live feedback

Deliberately **not** in v1. The groundwork is done and tested: `main.js` already feeds every received line through `LineBuffer → parseDeviceReply → applyReplyToState`, maintaining `this.state` (routing / audioMute / hdcp / scaler / cecPower). Adding feedback is a **pure addition**, no restructuring:
1. Add a poll timer (or rely on push) issuing `GET MP all`, `GET MUTE`, etc.
2. Register feedback definitions in `src/feedbacks.js` (currently registers `{}`).
3. Add the out-of-range index guard noted in the backlog before consuming `state` for display.

First confirm the matrix's telnet server accepts the connection pattern you need (single vs. multiple sessions) — untested without hardware.

---

## Quick reference — what each action sends

All commands are `\r\n`-terminated. Inputs/outputs 1–4.

| Action | Command sent |
|---|---|
| Switch Input to Output | `SET SW hdmiin{1-4} hdmiout{1-4}` |
| Reboot Matrix | `REBOOT` |
| Save Hardware Scene | `SAVE PRESET {1-8}` |
| Recall Hardware Scene | `RESTORE PRESET {1-8}` |
| Set Audio Mute | `SET MUTE {audioout1-4 \| all} {on\|off}` |
| Set HDCP Support | `SET HDCP_S hdmiin{1-4} {on\|off}` |
| Set Output Downscaler | `SET SCALER {hdmiout1-4 \| all} {on\|off}` |
| Set CEC Display Power | `SET CEC_PWR {hdmiout1-4 \| all} {on\|off}` |
| Set Input EDID | `SET EDID hdmiin{1-4} {01-12, zero-padded}` |

EDID preset codes: `01-04` copy from output 1–4; `05` 4K60 5.1ch HDR; `06` 4K60 2.0ch HDR; `09` 4K30 2.0ch HDR; `11` 1080p60 2.0ch; `12` Smart EDID.

Your planned use: IN1/IN2 (4K 59.94, Main/Backup) → OUT1; IN3/IN4 (1080p 59.94, Main/Backup) → OUT3.

---

*Built June 2026. Resume by re-reading this file + `git log`. The implementation worktree may still exist under `.claude/worktrees/` — safe to remove; everything is on `main`.*
