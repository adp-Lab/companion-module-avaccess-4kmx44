# AV Access 4KMX44-H2 Companion Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bitfocus Companion module for the AV Access 4KMX44-H2 matrix covering switching, reboot, hardware scene save/recall, audio mute, HDCP, downscaler, CEC power, and EDID presets — fully verified against a simulated device, since the real matrix has not arrived yet.

**Architecture:** Pure, dependency-free command-building and reply-parsing logic in `src/commands.js`, unit-tested with zero I/O. A thin `src/main.js` wires that logic to a real TCP socket via `@companion-module/base`'s `TCPHelper`. `src/actions.js` and `src/presets.js` expose the user-facing surface. `src/feedbacks.js` exists but registers nothing yet — the state-tracking groundwork is built now so visible feedback is a pure addition later, not a restructuring.

**Tech Stack:** Plain JavaScript (no TypeScript/build step), `@companion-module/base` SDK, npm (not yarn — see Global Constraints), Node's built-in `node:test` runner (no external test framework).

**Spec:** `docs/superpowers/specs/2026-06-23-avaccess-4kmx44-module-design.md`

## Global Constraints

- No live feedback in v1 — `feedbacks.js` registers `setFeedbackDefinitions({})` and nothing calls `checkFeedbacks()`. State is tracked but not yet exposed.
- Never expose `RESET` (factory reset), `SET IPADDR`/`SET IP MODE` (network config), `UPG` (firmware upgrade), EDID file upload, or `AUTOCEC_FN`/`AUTOCEC_D` as actions — explicitly out of scope.
- Every command sent to the device is terminated with `\r\n` (confirmed required by the device; the generic-tcp-udp module's default of bare `\n` is a documented prior failure mode).
- EDID preset codes (1-12) are sent as **zero-padded two-digit strings** (`05`, not `5`) — confirmed from the manufacturer's documented request/response examples.
- Default Telnet port is `23`.
- Package manager is **npm**, not yarn — the official Bitfocus template defaults to yarn, but yarn isn't installed on this machine and the project has no need for yarn-specific features. This is a deliberate, low-risk deviation.
- Test runner is Node's built-in `node:test` / `node:assert` — zero added dependencies, run via `npm test` → `node --test` (no path argument — relies on Node's default recursive auto-discovery of `*.test.js` files from cwd). **Correction discovered during Task 4 (2026-06-23):** the originally-planned `node --test test/` (bare directory argument) fails on this machine's Node v25.6.1 with `MODULE_NOT_FOUND` — verified directly. Individual file invocations like `node --test test/commands.test.js` throughout this plan are unaffected; only the catch-all `npm test` script needed this fix.
- Repo: `adp-Lab/companion-module-avaccess-4kmx44` (private), manifest `id`: `avaccess-4kmx44`, license MIT.
- **Correction discovered during Task 4 (2026-06-23):** the official Bitfocus JS template (`bitfocus/companion-module-template-js`, fetched during planning) is stale relative to its own pinned dependency. It shows `runEntrypoint(ModuleInstance, UpgradeScripts)`, but `@companion-module/base`'s own CHANGELOG.md confirms `runEntrypoint` was removed in v2.0.0-alpha.0 ("remove runEntrypoint method, expect default export instead") and the installed v2.0.4 genuinely does not export it (verified directly: `Object.keys(require('@companion-module/base'))` lists `InstanceBase, InstanceStatus, Regex, TCPHelper, TelnetHelper, UDPHelper, combineRgb, createModuleLogger, ...` — no `runEntrypoint`). The correct v1 bootstrap (we have no prior version, so no upgrade scripts exist to pass anywhere) is simply `module.exports = ModuleInstance` at the bottom of `src/main.js` — see the corrected code in Task 9.
- Because `module.exports = ModuleInstance` has no side effect at module-load time (it only defines a class), `src/main.js` **is** safe to `require()` in a test for static shape-checking (e.g. confirming it exports a class with an `init` method) — unlike the old `runEntrypoint(...)` call, which would have executed immediately on require. It is still never safe to **instantiate** (`new ModuleInstance(...)`) or call lifecycle methods on outside a real Companion IPC context — Task 9 only syntax-checks and shape-checks it; real runtime behavior is confirmed by loading it into Companion's developer mode (final task, manual).

---

### Task 1: Command builders (`src/commands.js`)

**Files:**
- Create: `src/commands.js`
- Test: `test/commands.test.js`

**Interfaces:**
- Produces: `buildSwitchCommand(input, output)`, `buildRebootCommand()`, `buildSaveSceneCommand(slot)`, `buildRecallSceneCommand(slot)`, `buildMuteCommand(output, state)`, `buildHdcpCommand(input, state)`, `buildScalerCommand(output, state)`, `buildCecPowerCommand(output, state)`, `buildEdidCommand(input, presetId)` — all pure functions returning a `\r\n`-terminated command string. `output`/`input` accept a number or numeric string; for the mute/scaler/cec-power builders, `output` may also be the literal string `'all'`.

- [ ] **Step 1: Write the failing tests**

Create `test/commands.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildSwitchCommand,
  buildRebootCommand,
  buildSaveSceneCommand,
  buildRecallSceneCommand,
  buildMuteCommand,
  buildHdcpCommand,
  buildScalerCommand,
  buildCecPowerCommand,
  buildEdidCommand,
} = require('../src/commands')

test('buildSwitchCommand builds the documented SET SW syntax', () => {
  assert.equal(buildSwitchCommand(1, 1), 'SET SW hdmiin1 hdmiout1\r\n')
  assert.equal(buildSwitchCommand(2, 3), 'SET SW hdmiin2 hdmiout3\r\n')
  assert.equal(buildSwitchCommand(4, 4), 'SET SW hdmiin4 hdmiout4\r\n')
})

test('buildRebootCommand builds the bare REBOOT command', () => {
  assert.equal(buildRebootCommand(), 'REBOOT\r\n')
})

test('buildSaveSceneCommand and buildRecallSceneCommand include the slot number', () => {
  assert.equal(buildSaveSceneCommand(1), 'SAVE PRESET 1\r\n')
  assert.equal(buildSaveSceneCommand(8), 'SAVE PRESET 8\r\n')
  assert.equal(buildRecallSceneCommand(1), 'RESTORE PRESET 1\r\n')
})

test('buildMuteCommand builds SET MUTE for a specific output and for all', () => {
  assert.equal(buildMuteCommand('1', 'on'), 'SET MUTE audioout1 on\r\n')
  assert.equal(buildMuteCommand('4', 'off'), 'SET MUTE audioout4 off\r\n')
  assert.equal(buildMuteCommand('all', 'on'), 'SET MUTE all on\r\n')
})

test('buildHdcpCommand builds SET HDCP_S for an input', () => {
  assert.equal(buildHdcpCommand(1, 'off'), 'SET HDCP_S hdmiin1 off\r\n')
})

test('buildScalerCommand builds SET SCALER for a specific output and for all', () => {
  assert.equal(buildScalerCommand('1', 'on'), 'SET SCALER hdmiout1 on\r\n')
  assert.equal(buildScalerCommand('all', 'off'), 'SET SCALER all off\r\n')
})

test('buildCecPowerCommand builds SET CEC_PWR for a specific output and for all', () => {
  assert.equal(buildCecPowerCommand('1', 'on'), 'SET CEC_PWR hdmiout1 on\r\n')
  assert.equal(buildCecPowerCommand('all', 'off'), 'SET CEC_PWR all off\r\n')
})

test('buildEdidCommand zero-pads the preset id to two digits', () => {
  assert.equal(buildEdidCommand(1, 5), 'SET EDID hdmiin1 05\r\n')
  assert.equal(buildEdidCommand(2, 12), 'SET EDID hdmiin2 12\r\n')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/drean/Ponyhof/companion-module-avaccess-4kmx44 && node --test test/commands.test.js`
Expected: FAIL — `Cannot find module '../src/commands'`

- [ ] **Step 3: Write the minimal implementation**

Create `src/commands.js`:

```js
function buildSwitchCommand(input, output) {
  return `SET SW hdmiin${input} hdmiout${output}\r\n`
}

function buildRebootCommand() {
  return `REBOOT\r\n`
}

function buildSaveSceneCommand(slot) {
  return `SAVE PRESET ${slot}\r\n`
}

function buildRecallSceneCommand(slot) {
  return `RESTORE PRESET ${slot}\r\n`
}

function buildMuteCommand(output, state) {
  const target = output === 'all' ? 'all' : `audioout${output}`
  return `SET MUTE ${target} ${state}\r\n`
}

function buildHdcpCommand(input, state) {
  return `SET HDCP_S hdmiin${input} ${state}\r\n`
}

function buildScalerCommand(output, state) {
  const target = output === 'all' ? 'all' : `hdmiout${output}`
  return `SET SCALER ${target} ${state}\r\n`
}

function buildCecPowerCommand(output, state) {
  const target = output === 'all' ? 'all' : `hdmiout${output}`
  return `SET CEC_PWR ${target} ${state}\r\n`
}

function buildEdidCommand(input, presetId) {
  const padded = String(presetId).padStart(2, '0')
  return `SET EDID hdmiin${input} ${padded}\r\n`
}

module.exports = {
  buildSwitchCommand,
  buildRebootCommand,
  buildSaveSceneCommand,
  buildRecallSceneCommand,
  buildMuteCommand,
  buildHdcpCommand,
  buildScalerCommand,
  buildCecPowerCommand,
  buildEdidCommand,
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/commands.test.js`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/commands.js test/commands.test.js
git commit -m "feat: add command builders for matrix control"
```

---

### Task 2: Line buffering and reply parsing (`src/commands.js`)

**Files:**
- Modify: `src/commands.js`
- Test: `test/commands.test.js`

**Interfaces:**
- Consumes: nothing new
- Produces: `LineBuffer` class with `.push(chunk: string): string[]` — accumulates partial data and returns complete `\r\n`-terminated lines, holding back any trailing partial fragment. `parseDeviceReply(line: string): { keyword: string, target: string|null, value: string|null } | null` — recognizes `SW`, `MP`, `MUTE`, `HDCP_S`, `SCALER`, `CEC_PWR`, `PRESET`, `EDID`, `REBOOT`, `RESET`; returns `null` for blank lines or unrecognized keywords.

- [ ] **Step 1: Write the failing tests**

Append to `test/commands.test.js`:

```js
const { LineBuffer, parseDeviceReply } = require('../src/commands')

test('LineBuffer withholds an incomplete line until the terminator arrives', () => {
  const lb = new LineBuffer()
  assert.deepEqual(lb.push('SW hdmiin1 '), [])
  assert.deepEqual(lb.push('hdmiout2\r\n'), ['SW hdmiin1 hdmiout2'])
})

test('LineBuffer splits multiple lines arriving in a single chunk', () => {
  const lb = new LineBuffer()
  const lines = lb.push('MP hdmiin1 hdmiout1\r\nMP hdmiin2 hdmiout2\r\n')
  assert.deepEqual(lines, ['MP hdmiin1 hdmiout1', 'MP hdmiin2 hdmiout2'])
})

test('parseDeviceReply parses a switch echo and a status query reply', () => {
  assert.deepEqual(parseDeviceReply('SW hdmiin1 hdmiout2'), { keyword: 'SW', target: 'hdmiin1', value: 'hdmiout2' })
  assert.deepEqual(parseDeviceReply('MP hdmiin2 hdmiout1'), { keyword: 'MP', target: 'hdmiin2', value: 'hdmiout1' })
})

test('parseDeviceReply parses mute, HDCP, scaler, CEC power, scene, and EDID replies', () => {
  assert.deepEqual(parseDeviceReply('MUTE audioout1 on'), { keyword: 'MUTE', target: 'audioout1', value: 'on' })
  assert.deepEqual(parseDeviceReply('HDCP_S hdmiin1 on'), { keyword: 'HDCP_S', target: 'hdmiin1', value: 'on' })
  assert.deepEqual(parseDeviceReply('SCALER hdmiout1 on'), { keyword: 'SCALER', target: 'hdmiout1', value: 'on' })
  assert.deepEqual(parseDeviceReply('CEC_PWR hdmiout1 on'), { keyword: 'CEC_PWR', target: 'hdmiout1', value: 'on' })
  assert.deepEqual(parseDeviceReply('PRESET 1'), { keyword: 'PRESET', target: '1', value: null })
  assert.deepEqual(parseDeviceReply('EDID hdmiin1 05'), { keyword: 'EDID', target: 'hdmiin1', value: '05' })
})

test('parseDeviceReply parses bare REBOOT and RESET acknowledgements', () => {
  assert.deepEqual(parseDeviceReply('REBOOT'), { keyword: 'REBOOT', target: null, value: null })
  assert.deepEqual(parseDeviceReply('RESET'), { keyword: 'RESET', target: null, value: null })
})

test('parseDeviceReply returns null for blank lines and unrecognized keywords', () => {
  assert.equal(parseDeviceReply(''), null)
  assert.equal(parseDeviceReply('   '), null)
  assert.equal(parseDeviceReply('GARBAGE 1 2'), null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/commands.test.js`
Expected: FAIL — `LineBuffer is not a constructor` / `parseDeviceReply is not a function`

- [ ] **Step 3: Write the minimal implementation**

Append to `src/commands.js`, and add the two new names to the existing `module.exports` object:

```js
class LineBuffer {
  constructor() {
    this.buffer = ''
  }

  push(chunk) {
    this.buffer += chunk
    const lines = []
    let index
    while ((index = this.buffer.indexOf('\r\n')) >= 0) {
      lines.push(this.buffer.slice(0, index))
      this.buffer = this.buffer.slice(index + 2)
    }
    return lines
  }
}

const KNOWN_REPLY_KEYWORDS = ['SW', 'MP', 'MUTE', 'HDCP_S', 'SCALER', 'CEC_PWR', 'PRESET', 'EDID', 'REBOOT', 'RESET']

function parseDeviceReply(line) {
  const trimmed = line.trim()
  if (trimmed === '') return null

  const parts = trimmed.split(/\s+/)
  const keyword = parts[0]

  if (!KNOWN_REPLY_KEYWORDS.includes(keyword)) return null

  return {
    keyword,
    target: parts[1] ?? null,
    value: parts[2] ?? null,
  }
}
```

Update the `module.exports = { ... }` block at the bottom of `src/commands.js` to also include `LineBuffer` and `parseDeviceReply`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/commands.test.js`
Expected: PASS — 14 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/commands.js test/commands.test.js
git commit -m "feat: add line buffering and device reply parsing"
```

---

### Task 3: Matrix state model (`src/commands.js`)

**Files:**
- Modify: `src/commands.js`
- Test: `test/commands.test.js`

**Interfaces:**
- Consumes: the `{ keyword, target, value }` shape produced by `parseDeviceReply` (Task 2)
- Produces: `createInitialState(): MatrixState` where `MatrixState = { routing: {1..4: number|null}, audioMute: {1..4: boolean|null}, hdcp: {1..4: boolean|null}, scaler: {1..4: boolean|null}, cecPower: {1..4: boolean|null} }`. `applyReplyToState(state: MatrixState, reply: ParsedReply|null): void` — mutates `state` in place; safe to call with `null`.

- [ ] **Step 1: Write the failing tests**

Append to `test/commands.test.js`:

```js
const { createInitialState, applyReplyToState } = require('../src/commands')

test('createInitialState starts every tracked value as null', () => {
  const state = createInitialState()
  assert.deepEqual(state.routing, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.audioMute, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.hdcp, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.scaler, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.cecPower, { 1: null, 2: null, 3: null, 4: null })
})

test('applyReplyToState records a single-output switch', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('SW hdmiin1 hdmiout2'))
  assert.equal(state.routing[2], 1)
})

test('applyReplyToState records a switch-to-all-outputs reply', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('SW hdmiin3 all'))
  assert.deepEqual(state.routing, { 1: 3, 2: 3, 3: 3, 4: 3 })
})

test('applyReplyToState records mute, HDCP, scaler, and CEC power for a single target', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('MUTE audioout1 on'))
  applyReplyToState(state, parseDeviceReply('HDCP_S hdmiin2 off'))
  applyReplyToState(state, parseDeviceReply('SCALER hdmiout3 on'))
  applyReplyToState(state, parseDeviceReply('CEC_PWR hdmiout4 off'))
  assert.equal(state.audioMute[1], true)
  assert.equal(state.hdcp[2], false)
  assert.equal(state.scaler[3], true)
  assert.equal(state.cecPower[4], false)
})

test('applyReplyToState records an "all" target for mute, scaler, and CEC power', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('MUTE all on'))
  assert.deepEqual(state.audioMute, { 1: true, 2: true, 3: true, 4: true })
})

test('applyReplyToState ignores a null reply without throwing', () => {
  const state = createInitialState()
  applyReplyToState(state, null)
  assert.deepEqual(state.routing, { 1: null, 2: null, 3: null, 4: null })
})

test('the full pipeline applies a multi-line GET MP all reply', () => {
  const state = createInitialState()
  const lb = new LineBuffer()
  const lines = lb.push(
    'MP hdmiin1 hdmiout1\r\nMP hdmiin2 hdmiout2\r\nMP hdmiin3 hdmiout3\r\nMP hdmiin4 hdmiout4\r\n',
  )
  for (const line of lines) {
    applyReplyToState(state, parseDeviceReply(line))
  }
  assert.deepEqual(state.routing, { 1: 1, 2: 2, 3: 3, 4: 4 })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/commands.test.js`
Expected: FAIL — `createInitialState is not a function`

- [ ] **Step 3: Write the minimal implementation**

Append to `src/commands.js`:

```js
function createInitialState() {
  return {
    routing: { 1: null, 2: null, 3: null, 4: null },
    audioMute: { 1: null, 2: null, 3: null, 4: null },
    hdcp: { 1: null, 2: null, 3: null, 4: null },
    scaler: { 1: null, 2: null, 3: null, 4: null },
    cecPower: { 1: null, 2: null, 3: null, 4: null },
  }
}

function applyBoolState(stateMap, target, value, prefix) {
  if (target === 'all') {
    for (const key of Object.keys(stateMap)) {
      stateMap[key] = value === 'on'
    }
    return
  }
  if (target) {
    const num = parseInt(target.replace(prefix, ''), 10)
    if (!Number.isNaN(num)) {
      stateMap[num] = value === 'on'
    }
  }
}

function applyReplyToState(state, reply) {
  if (!reply) return

  const { keyword, target, value } = reply

  if (keyword === 'SW' || keyword === 'MP') {
    if (!target) return
    const inputNum = parseInt(target.replace('hdmiin', ''), 10)
    if (Number.isNaN(inputNum)) return

    if (value === 'all') {
      for (const out of Object.keys(state.routing)) {
        state.routing[out] = inputNum
      }
    } else if (value) {
      const outputNum = parseInt(value.replace('hdmiout', ''), 10)
      if (!Number.isNaN(outputNum)) {
        state.routing[outputNum] = inputNum
      }
    }
  } else if (keyword === 'MUTE') {
    applyBoolState(state.audioMute, target, value, 'audioout')
  } else if (keyword === 'HDCP_S') {
    applyBoolState(state.hdcp, target, value, 'hdmiin')
  } else if (keyword === 'SCALER') {
    applyBoolState(state.scaler, target, value, 'hdmiout')
  } else if (keyword === 'CEC_PWR') {
    applyBoolState(state.cecPower, target, value, 'hdmiout')
  }
}
```

Update `module.exports` in `src/commands.js` to also include `createInitialState` and `applyReplyToState`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/commands.test.js`
Expected: PASS — 21 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/commands.js test/commands.test.js
git commit -m "feat: add matrix state model updated from parsed replies"
```

---

### Task 4: Project scaffold and dependency setup

**Files:**
- Create: `package.json`, `companion/manifest.json`, `companion/HELP.md`, `src/feedbacks.js`, `.gitignore`, `LICENSE`
- Test: `test/manifest.test.js`

**Interfaces:**
- Produces: an installed `@companion-module/base` dependency in `node_modules/`; `src/feedbacks.js` exporting `function(self) { self.setFeedbackDefinitions({}) }` (no feedback definitions yet, by design).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "avaccess-4kmx44",
  "version": "0.1.0",
  "main": "src/main.js",
  "scripts": {
    "test": "node --test"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/adp-Lab/companion-module-avaccess-4kmx44.git"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@companion-module/base": "~2.0.4"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/drean/Ponyhof/companion-module-avaccess-4kmx44 && npm install`
Expected: exits 0, creates `node_modules/@companion-module/base` and `package-lock.json`

- [ ] **Step 3: Verify the dependency loads**

Run: `node -e "const m = require('@companion-module/base'); console.log(typeof m.InstanceBase, typeof m.TCPHelper, typeof m.InstanceStatus, typeof m.Regex)"`
Expected output: `function function object object`

(Earlier versions of this plan checked for `m.runEntrypoint` here too — that was wrong. `@companion-module/base`'s own CHANGELOG.md confirms `runEntrypoint` was removed in v2.0.0-alpha.0 ("remove runEntrypoint method, expect default export instead"); v2.0.4 does not export it. Task 9's `main.js` uses `module.exports = ModuleInstance` instead, with no `runEntrypoint` call.)

If this fails or prints `undefined` for any of the four, stop and re-check the installed version against `@companion-module/base`'s actual published exports (`node -e "console.log(Object.keys(require('@companion-module/base')))"`) before continuing — everything from here on depends on these four exports existing as expected.

- [ ] **Step 4: Create `companion/manifest.json`**

```json
{
  "id": "avaccess-4kmx44",
  "name": "AV Access 4KMX44-H2",
  "shortname": "4kmx44-h2",
  "description": "4x4 HDMI matrix with audio breakout, controlled over Telnet",
  "version": "0.0.0",
  "license": "MIT",
  "repository": "git+https://github.com/adp-Lab/companion-module-avaccess-4kmx44.git",
  "bugs": "https://github.com/adp-Lab/companion-module-avaccess-4kmx44/issues",
  "maintainers": [{ "name": "Andre Doelle", "email": "mohn.edgar@gmail.com" }],
  "runtime": {
    "type": "node22",
    "api": "nodejs-ipc",
    "apiVersion": "0.0.0",
    "entrypoint": "../src/main.js"
  },
  "legacyIds": [],
  "manufacturer": "AV Access",
  "products": ["4KMX44-H2"],
  "keywords": ["matrix", "hdmi", "switcher"]
}
```

- [ ] **Step 5: Create `companion/HELP.md`**

```markdown
# AV Access 4KMX44-H2

Companion module for the AV Access 4KMX44-H2 4x4 HDMI matrix, controlled over its Telnet/IP API (port 23 by default).

## Configuration

| Option | Description |
| --- | --- |
| Target IP | The matrix's IP address |
| Target Port | Telnet control port, default 23 |

## Actions

- Switch Input to Output
- Reboot Matrix
- Save / Recall Hardware Scene
- Set Audio Mute
- Set HDCP Support
- Set Output Downscaler
- Set CEC Display Power
- Set Input EDID

## Known limitations (v1)

No live feedback yet — button highlighting based on actual device state is planned for a future version, pending verification against real hardware.
```

- [ ] **Step 6: Create `src/feedbacks.js`**

```js
module.exports = function (self) {
  self.setFeedbackDefinitions({})
}
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
*.log
```

- [ ] **Step 8: Create `LICENSE`**

```
MIT License

Copyright (c) 2026 Andre Doelle

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 9: Write a failing test for the manifest**

Create `test/manifest.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../companion/manifest.json')

test('manifest.json has every field required by the Companion module schema', () => {
  const requiredFields = [
    'id', 'name', 'shortname', 'description', 'manufacturer',
    'products', 'keywords', 'version', 'license', 'repository',
    'bugs', 'maintainers',
  ]
  for (const field of requiredFields) {
    assert.ok(field in manifest, `manifest.json is missing required field "${field}"`)
  }
  assert.equal(manifest.id, 'avaccess-4kmx44')
  assert.equal(manifest.runtime.type, 'node22')
  assert.equal(manifest.runtime.api, 'nodejs-ipc')
})
```

This test passes immediately since Step 4 already created a complete manifest — that's fine, it still guards against future accidental edits removing a required field.

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test test/manifest.test.js`
Expected: PASS — 1 test, 0 failures

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json companion/ src/feedbacks.js .gitignore LICENSE test/manifest.test.js
git commit -m "chore: scaffold module package, manifest, and empty feedbacks stub"
```

---

### Task 5: Actions (`src/actions.js`)

**Files:**
- Create: `src/actions.js`
- Test: `test/actions.test.js`

**Interfaces:**
- Consumes: all 9 builders from `src/commands.js` (Task 1); a `self` object with `self.sendCommand(command: string): void` and `self.setActionDefinitions(defs: object): void`
- Produces: calling `module.exports(self)` registers 9 action definitions on `self`, each with `options` and an async `callback(action)` that calls `self.sendCommand(...)` with the matching builder's output.

- [ ] **Step 1: Write the failing tests**

Create `test/actions.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const UpdateActions = require('../src/actions')

function makeFakeSelf() {
  const sent = []
  const actionDefs = {}
  const self = {
    sendCommand(cmd) {
      sent.push(cmd)
    },
    setActionDefinitions(defs) {
      Object.assign(actionDefs, defs)
    },
  }
  UpdateActions(self)
  return { sent, actionDefs }
}

test('switch_input_to_output sends the SET SW command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.switch_input_to_output.callback({ options: { input: 2, output: 3 } })
  assert.deepEqual(sent, ['SET SW hdmiin2 hdmiout3\r\n'])
})

test('reboot_matrix sends the bare REBOOT command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.reboot_matrix.callback({ options: {} })
  assert.deepEqual(sent, ['REBOOT\r\n'])
})

test('save_scene and recall_scene send the scene slot', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.save_scene.callback({ options: { slot: 3 } })
  await actionDefs.recall_scene.callback({ options: { slot: 3 } })
  assert.deepEqual(sent, ['SAVE PRESET 3\r\n', 'RESTORE PRESET 3\r\n'])
})

test('set_audio_mute sends the mute command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.set_audio_mute.callback({ options: { output: 'all', state: 'off' } })
  assert.deepEqual(sent, ['SET MUTE all off\r\n'])
})

test('set_hdcp sends the HDCP command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.set_hdcp.callback({ options: { input: 4, state: 'on' } })
  assert.deepEqual(sent, ['SET HDCP_S hdmiin4 on\r\n'])
})

test('set_downscaler sends the scaler command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.set_downscaler.callback({ options: { output: '2', state: 'off' } })
  assert.deepEqual(sent, ['SET SCALER hdmiout2 off\r\n'])
})

test('set_cec_power sends the CEC power command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.set_cec_power.callback({ options: { output: 'all', state: 'on' } })
  assert.deepEqual(sent, ['SET CEC_PWR all on\r\n'])
})

test('set_edid sends the EDID command', async () => {
  const { sent, actionDefs } = makeFakeSelf()
  await actionDefs.set_edid.callback({ options: { input: 3, preset: 11 } })
  assert.deepEqual(sent, ['SET EDID hdmiin3 11\r\n'])
})

test('all 9 actions are registered', () => {
  const { actionDefs } = makeFakeSelf()
  assert.deepEqual(
    Object.keys(actionDefs).sort(),
    [
      'recall_scene', 'reboot_matrix', 'save_scene', 'set_audio_mute',
      'set_cec_power', 'set_downscaler', 'set_edid', 'set_hdcp',
      'switch_input_to_output',
    ].sort(),
  )
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/actions.test.js`
Expected: FAIL — `Cannot find module '../src/actions'`

- [ ] **Step 3: Write the minimal implementation**

Create `src/actions.js`:

```js
const {
  buildSwitchCommand,
  buildRebootCommand,
  buildSaveSceneCommand,
  buildRecallSceneCommand,
  buildMuteCommand,
  buildHdcpCommand,
  buildScalerCommand,
  buildCecPowerCommand,
  buildEdidCommand,
} = require('./commands')

const INPUT_CHOICES = [1, 2, 3, 4].map((n) => ({ id: n, label: `Input ${n}` }))
const OUTPUT_CHOICES = [1, 2, 3, 4].map((n) => ({ id: n, label: `Output ${n}` }))
const OUTPUT_CHOICES_WITH_ALL = [
  ...[1, 2, 3, 4].map((n) => ({ id: String(n), label: `Output ${n}` })),
  { id: 'all', label: 'All Outputs' },
]
const ON_OFF_CHOICES = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
]
const SCENE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n, label: `Scene ${n}` }))
const EDID_CHOICES = [
  { id: 1, label: 'Copy from Output 1' },
  { id: 2, label: 'Copy from Output 2' },
  { id: 3, label: 'Copy from Output 3' },
  { id: 4, label: 'Copy from Output 4' },
  { id: 5, label: '4K@60Hz 5.1ch audio With HDR' },
  { id: 6, label: '4K@60Hz 2.0ch audio With HDR' },
  { id: 7, label: '4K@30Hz 7.1ch audio With HDR' },
  { id: 8, label: '4K@30Hz 5.1ch audio With HDR' },
  { id: 9, label: '4K@30Hz 2.0ch audio With HDR' },
  { id: 10, label: '4K@30Hz/8bit only 2.0ch audio Without HDR' },
  { id: 11, label: '1080P@60Hz 2.0ch audio' },
  { id: 12, label: 'Smart EDID' },
]

module.exports = function (self) {
  self.setActionDefinitions({
    switch_input_to_output: {
      name: 'Switch Input to Output',
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'output', label: 'Output', default: 1, choices: OUTPUT_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildSwitchCommand(action.options.input, action.options.output))
      },
    },
    reboot_matrix: {
      name: 'Reboot Matrix',
      options: [],
      callback: async () => {
        self.sendCommand(buildRebootCommand())
      },
    },
    save_scene: {
      name: 'Save Hardware Scene',
      options: [{ type: 'dropdown', id: 'slot', label: 'Scene Slot', default: 1, choices: SCENE_CHOICES }],
      callback: async (action) => {
        self.sendCommand(buildSaveSceneCommand(action.options.slot))
      },
    },
    recall_scene: {
      name: 'Recall Hardware Scene',
      options: [{ type: 'dropdown', id: 'slot', label: 'Scene Slot', default: 1, choices: SCENE_CHOICES }],
      callback: async (action) => {
        self.sendCommand(buildRecallSceneCommand(action.options.slot))
      },
    },
    set_audio_mute: {
      name: 'Set Audio Mute',
      options: [
        { type: 'dropdown', id: 'output', label: 'Output', default: '1', choices: OUTPUT_CHOICES_WITH_ALL },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildMuteCommand(action.options.output, action.options.state))
      },
    },
    set_hdcp: {
      name: 'Set HDCP Support',
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildHdcpCommand(action.options.input, action.options.state))
      },
    },
    set_downscaler: {
      name: 'Set Output Downscaler',
      options: [
        { type: 'dropdown', id: 'output', label: 'Output', default: '1', choices: OUTPUT_CHOICES_WITH_ALL },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildScalerCommand(action.options.output, action.options.state))
      },
    },
    set_cec_power: {
      name: 'Set CEC Display Power',
      options: [
        { type: 'dropdown', id: 'output', label: 'Output', default: '1', choices: OUTPUT_CHOICES_WITH_ALL },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildCecPowerCommand(action.options.output, action.options.state))
      },
    },
    set_edid: {
      name: 'Set Input EDID',
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'preset', label: 'EDID Preset', default: 12, choices: EDID_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildEdidCommand(action.options.input, action.options.preset))
      },
    },
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/actions.test.js`
Expected: PASS — 9 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/actions.js test/actions.test.js
git commit -m "feat: add the 9 matrix control actions"
```

---

### Task 6: Confirm `TCPHelper` works standalone against a fake matrix

This is a deliberate spike before building on top of `TCPHelper`: it has only been observed in use *inside* a running Companion module in this project (via reading the installed `generic-tcp-udp` module's source), never instantiated outside that context. If it turns out to require something only a real Companion process provides, every later task that depends on it needs to know now, not after `main.js` is written.

**Files:**
- Test: `test/tcp-pipeline.integration.test.js`

**Interfaces:**
- Consumes: `TCPHelper`, `InstanceStatus` from `@companion-module/base`; `LineBuffer`, `parseDeviceReply`, `createInitialState`, `applyReplyToState` from `src/commands.js` (Tasks 2-3)

- [ ] **Step 1: Write the test**

Create `test/tcp-pipeline.integration.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { TCPHelper, InstanceStatus } = require('@companion-module/base')
const { LineBuffer, parseDeviceReply, createInitialState, applyReplyToState } = require('../src/commands')

function startFakeMatrix() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      server.lastSocket = socket
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

test('TCPHelper connects to a real socket and delivers data to our parsing pipeline', async () => {
  const server = await startFakeMatrix()
  const port = server.address().port

  const state = createInitialState()
  const lineBuffer = new LineBuffer()
  const tcp = new TCPHelper('127.0.0.1', port)

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for TCPHelper to connect')), 3000)
    tcp.on('status_change', (status) => {
      if (status === InstanceStatus.Ok) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })

  tcp.on('data', (chunk) => {
    const lines = lineBuffer.push(chunk.toString('latin1'))
    for (const line of lines) {
      applyReplyToState(state, parseDeviceReply(line))
    }
  })

  server.lastSocket.write('MP hdmiin1 hdmiout1\r\n')

  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.equal(state.routing[1], 1)

  tcp.destroy()
  server.close()
})
```

- [ ] **Step 2: Run the test**

Run: `node --test test/tcp-pipeline.integration.test.js`
Expected: PASS — 1 test, 0 failures.

If this fails with a timeout or a thrown error from inside `TCPHelper`, stop here — it means `TCPHelper` cannot run standalone outside a real Companion process, and `main.js` (Task 9) will need a different connection strategy than the one this plan assumes. Report back before continuing.

- [ ] **Step 3: Commit**

```bash
git add test/tcp-pipeline.integration.test.js
git commit -m "test: confirm TCPHelper works standalone against a fake matrix"
```

---

### Task 7: Confirm actions send exact bytes over a real TCP socket

**Files:**
- Test: `test/actions-tcp.integration.test.js`

**Interfaces:**
- Consumes: `TCPHelper`, `InstanceStatus` from `@companion-module/base`; `UpdateActions` from `src/actions.js` (Task 5)

- [ ] **Step 1: Write the test**

Create `test/actions-tcp.integration.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { TCPHelper, InstanceStatus } = require('@companion-module/base')
const UpdateActions = require('../src/actions')

function startFakeMatrix() {
  return new Promise((resolve) => {
    const received = []
    const server = net.createServer((socket) => {
      server.lastSocket = socket
      socket.on('data', (chunk) => received.push(chunk.toString('latin1')))
    })
    server.received = received
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function makeFakeSelfConnectedTo(port) {
  const tcp = new TCPHelper('127.0.0.1', port)
  await new Promise((resolve) => {
    tcp.on('status_change', (status) => {
      if (status === InstanceStatus.Ok) resolve()
    })
  })

  const actionDefs = {}
  const self = {
    sendCommand(cmd) {
      tcp.send(cmd)
    },
    log() {},
    setActionDefinitions(defs) {
      Object.assign(actionDefs, defs)
    },
  }
  UpdateActions(self)
  return { actionDefs, tcp }
}

test('every action sends the exact documented bytes over a real TCP socket', async () => {
  const server = await startFakeMatrix()
  const port = server.address().port
  const { actionDefs, tcp } = await makeFakeSelfConnectedTo(port)

  await actionDefs.switch_input_to_output.callback({ options: { input: 1, output: 1 } })
  await actionDefs.reboot_matrix.callback({ options: {} })
  await actionDefs.save_scene.callback({ options: { slot: 1 } })
  await actionDefs.recall_scene.callback({ options: { slot: 1 } })
  await actionDefs.set_audio_mute.callback({ options: { output: '1', state: 'on' } })
  await actionDefs.set_hdcp.callback({ options: { input: 1, state: 'off' } })
  await actionDefs.set_downscaler.callback({ options: { output: 'all', state: 'on' } })
  await actionDefs.set_cec_power.callback({ options: { output: '1', state: 'on' } })
  await actionDefs.set_edid.callback({ options: { input: 1, preset: 5 } })

  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.deepEqual(server.received, [
    'SET SW hdmiin1 hdmiout1\r\n',
    'REBOOT\r\n',
    'SAVE PRESET 1\r\n',
    'RESTORE PRESET 1\r\n',
    'SET MUTE audioout1 on\r\n',
    'SET HDCP_S hdmiin1 off\r\n',
    'SET SCALER all on\r\n',
    'SET CEC_PWR hdmiout1 on\r\n',
    'SET EDID hdmiin1 05\r\n',
  ])

  tcp.destroy()
  server.close()
})
```

- [ ] **Step 2: Run the test**

Run: `node --test test/actions-tcp.integration.test.js`
Expected: PASS — 1 test, 0 failures

- [ ] **Step 3: Commit**

```bash
git add test/actions-tcp.integration.test.js
git commit -m "test: confirm every action sends exact bytes over a real socket"
```

---

### Task 8: Presets (`src/presets.js`)

**Files:**
- Create: `src/presets.js`
- Test: `test/presets.test.js`

**Interfaces:**
- Consumes: action ids from `src/actions.js` (Task 5): `switch_input_to_output`, `reboot_matrix`, `set_audio_mute`, `recall_scene`
- Produces: `generateRoutingPresets(): object` (16 presets), `generateConveniencePresets(): object` (4 presets), and a default export `function(self)` that calls `self.setPresetDefinitions(structure, presets)` with both sets combined.

- [ ] **Step 1: Write the failing tests**

Create `test/presets.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { generateRoutingPresets, generateConveniencePresets } = require('../src/presets')

test('generateRoutingPresets produces all 16 input/output combinations', () => {
  const presets = generateRoutingPresets()
  assert.equal(Object.keys(presets).length, 16)
  assert.deepEqual(presets.route_in1_out1.steps[0].down[0], {
    actionId: 'switch_input_to_output',
    options: { input: 1, output: 1 },
  })
  assert.equal(presets.route_in1_out1.name, 'IN1→OUT1')
  assert.equal(presets.route_in4_out4.steps[0].down[0].options.input, 4)
})

test('generateConveniencePresets produces the reboot, mute, and scene-recall shortcuts', () => {
  const presets = generateConveniencePresets()
  assert.deepEqual(
    Object.keys(presets).sort(),
    ['mute_all', 'reboot_matrix', 'recall_scene_1', 'unmute_all'].sort(),
  )
  assert.deepEqual(presets.reboot_matrix.steps[0].down[0], { actionId: 'reboot_matrix', options: {} })
  assert.deepEqual(presets.mute_all.steps[0].down[0], {
    actionId: 'set_audio_mute',
    options: { output: 'all', state: 'on' },
  })
  assert.deepEqual(presets.recall_scene_1.steps[0].down[0], { actionId: 'recall_scene', options: { slot: 1 } })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/presets.test.js`
Expected: FAIL — `Cannot find module '../src/presets'`

- [ ] **Step 3: Write the minimal implementation**

Create `src/presets.js`:

```js
function generateRoutingPresets() {
  const presets = {}
  for (let input = 1; input <= 4; input++) {
    for (let output = 1; output <= 4; output++) {
      presets[`route_in${input}_out${output}`] = {
        type: 'simple',
        name: `IN${input}→OUT${output}`,
        style: {
          text: `IN${input}→OUT${output}`,
          size: '18',
          color: 0xffffff,
          bgcolor: 0x000000,
        },
        steps: [
          {
            down: [{ actionId: 'switch_input_to_output', options: { input, output } }],
            up: [],
          },
        ],
        feedbacks: [],
      }
    }
  }
  return presets
}

function generateConveniencePresets() {
  return {
    reboot_matrix: {
      type: 'simple',
      name: 'Reboot Matrix',
      style: { text: 'REBOOT', size: '14', color: 0xffffff, bgcolor: 0xcc0000 },
      steps: [{ down: [{ actionId: 'reboot_matrix', options: {} }], up: [] }],
      feedbacks: [],
    },
    mute_all: {
      type: 'simple',
      name: 'Mute All',
      style: { text: 'MUTE ALL', size: '14', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'on' } }], up: [] }],
      feedbacks: [],
    },
    unmute_all: {
      type: 'simple',
      name: 'Unmute All',
      style: { text: 'UNMUTE ALL', size: '14', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'off' } }], up: [] }],
      feedbacks: [],
    },
    recall_scene_1: {
      type: 'simple',
      name: 'Recall Scene 1',
      style: { text: 'SCENE 1', size: '14', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'recall_scene', options: { slot: 1 } }], up: [] }],
      feedbacks: [],
    },
  }
}

module.exports = function (self) {
  const routingPresets = generateRoutingPresets()
  const conveniencePresets = generateConveniencePresets()
  const presets = { ...routingPresets, ...conveniencePresets }

  const structure = [
    { id: 'routing', name: 'Routing', definitions: Object.keys(routingPresets) },
    { id: 'convenience', name: 'Convenience', definitions: Object.keys(conveniencePresets) },
  ]

  self.setPresetDefinitions(structure, presets)
}

module.exports.generateRoutingPresets = generateRoutingPresets
module.exports.generateConveniencePresets = generateConveniencePresets
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/presets.test.js`
Expected: PASS — 2 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/presets.js test/presets.test.js
git commit -m "feat: add 16 routing presets and 4 convenience presets"
```

---

### Task 9: Wire it all together (`src/main.js`)

**Files:**
- Create: `src/main.js`

**Interfaces:**
- Consumes: `InstanceBase`, `Regex`, `InstanceStatus`, `TCPHelper` from `@companion-module/base`; `LineBuffer`, `parseDeviceReply`, `createInitialState`, `applyReplyToState` from `src/commands.js`; default exports of `src/actions.js`, `src/presets.js`, `src/feedbacks.js`

Most of this task has no new *behavioral* test of its own — Task 6 already confirmed the `TCPHelper` + parsing pipeline works, and Task 7 already confirmed the actions produce correct bytes over a real socket. `main.js` only assembles those already-proven pieces into the class Companion loads. Per Global Constraints, `module.exports = ModuleInstance` (not `runEntrypoint`, which was removed in `@companion-module/base` v2.0.0) has no side effect at require time, so this file can be safely `require()`'d for a static shape-check test — but never instantiated or have its lifecycle methods called outside a real Companion IPC context.

- [ ] **Step 1: Create `src/main.js`**

```js
const { InstanceBase, Regex, InstanceStatus, TCPHelper } = require('@companion-module/base')
const { LineBuffer, parseDeviceReply, createInitialState, applyReplyToState } = require('./commands')
const UpdateActions = require('./actions')
const UpdatePresets = require('./presets')
const UpdateFeedbacks = require('./feedbacks')

class ModuleInstance extends InstanceBase {
  async init(config) {
    this.config = config
    this.state = createInitialState()

    this.updateActions()
    this.updateFeedbacks()
    this.updatePresets()

    this.initTcp()
  }

  async destroy() {
    if (this.socket) {
      this.socket.destroy()
      delete this.socket
    }
  }

  async configUpdated(config) {
    this.config = config
    this.initTcp()
  }

  getConfigFields() {
    return [
      { type: 'textinput', id: 'host', label: 'Target IP', width: 8, regex: Regex.IP },
      { type: 'textinput', id: 'port', label: 'Target Port', width: 4, default: '23', regex: Regex.PORT },
    ]
  }

  initTcp() {
    if (this.socket) {
      this.socket.destroy()
      delete this.socket
    }

    this.updateStatus(InstanceStatus.Connecting)

    if (!this.config.host) {
      this.updateStatus(InstanceStatus.BadConfig)
      return
    }

    this.lineBuffer = new LineBuffer()
    this.socket = new TCPHelper(this.config.host, this.config.port || 23)

    this.socket.on('status_change', (status, message) => {
      this.updateStatus(status, message)
    })

    this.socket.on('error', (err) => {
      this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
      this.log('error', `Network error: ${err.message}`)
    })

    this.socket.on('data', (chunk) => {
      const lines = this.lineBuffer.push(chunk.toString('latin1'))
      for (const line of lines) {
        const reply = parseDeviceReply(line)
        applyReplyToState(this.state, reply)
      }
    })
  }

  sendCommand(command) {
    if (this.socket) {
      this.socket.send(command)
    } else {
      this.log('warn', `Not connected, dropped command: ${command.trim()}`)
    }
  }

  updateActions() {
    UpdateActions(this)
  }

  updateFeedbacks() {
    UpdateFeedbacks(this)
  }

  updatePresets() {
    UpdatePresets(this)
  }
}

module.exports = ModuleInstance
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check src/main.js`
Expected: no output, exits 0

- [ ] **Step 3: Write and run a shape-check test**

Create `test/main.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { InstanceBase } = require('@companion-module/base')
const ModuleInstance = require('../src/main')

test('main.js exports a ModuleInstance class extending InstanceBase with the required lifecycle methods', () => {
  assert.equal(typeof ModuleInstance, 'function')
  assert.ok(ModuleInstance.prototype instanceof InstanceBase)
  for (const method of ['init', 'destroy', 'configUpdated', 'getConfigFields', 'sendCommand']) {
    assert.equal(typeof ModuleInstance.prototype[method], 'function', `missing method: ${method}`)
  }
})
```

This is safe to run — requiring `src/main.js` only defines the class (no `runEntrypoint`-style side effect runs at load time), and this test never calls `new ModuleInstance(...)` or invokes any lifecycle method, so it never touches a real IPC connection.

Run: `node --test test/main.test.js`
Expected: PASS — 1 test, 0 failures

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across `test/commands.test.js`, `test/manifest.test.js`, `test/actions.test.js`, `test/tcp-pipeline.integration.test.js`, `test/actions-tcp.integration.test.js`, `test/presets.test.js`, `test/main.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/main.js test/main.test.js
git commit -m "feat: wire actions, presets, feedbacks, and TCP connection into ModuleInstance"
```

---

### Task 10: README and manual developer-mode verification

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation and a manual checklist only.

- [ ] **Step 1: Update `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with status and developer-mode load instructions"
```

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Manual verification checklist (not automated — do this once, by hand)**

- [ ] Follow the "Loading into Companion's developer mode" steps above on this machine
- [ ] Confirm the connection shows "Bad Config" status before an IP is set, and "Connecting"/error status when given an unreachable IP
- [ ] Stand up a fake matrix with `node -e "require('net').createServer(s=>s.on('data',d=>console.log(d.toString()))).listen(2323,'127.0.0.1')"` and point the connection at `127.0.0.1:2323`
- [ ] Confirm status goes to OK once connected
- [ ] Press each of the 16 routing presets and the 4 convenience presets; confirm the fake matrix's console logs the expected bytes for each
- [ ] Once the real matrix arrives: repeat against it, confirm every action behaves as documented, and revisit the spec's "Open questions" section (scene slot ceiling, HDCP re-handshake behavior, EDID live-update behavior, switching latency) with real answers

---

## Plan Self-Review

**Spec coverage:** All 9 actions (Task 5), all 16 routing presets + convenience presets (Task 8), the feedback-ready state model (Tasks 2-3), the dual-layer testing strategy (unit tests in Tasks 1-3/5/8, integration tests in Tasks 6-7), the explicit non-goals (no RESET/network/firmware/EDID-write/AUTOCEC actions — none appear anywhere in this plan), and the empty `feedbacks.js` stub (Task 4) are all covered by a task. The spec's "Open questions" section is carried forward into Task 10's manual checklist rather than resolved here, since it requires real hardware.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code or an exact command with expected output.

**Type/name consistency:** Action ids (`switch_input_to_output`, `reboot_matrix`, `save_scene`, `recall_scene`, `set_audio_mute`, `set_hdcp`, `set_downscaler`, `set_cec_power`, `set_edid`) are identical across Task 5 (definitions), Task 7 (integration test), and Task 8 (presets referencing them). `commands.js` function names are identical between their introduction (Tasks 1-3) and their consumers (Tasks 5, 9). State shape (`routing`/`audioMute`/`hdcp`/`scaler`/`cecPower`, all keyed `1`-`4`) is identical between Task 3's definition and Task 9's usage.
