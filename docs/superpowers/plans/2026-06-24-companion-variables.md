# Companion Variables (Tier 1/2/3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Companion variables (`$(4kmx44-h2:<id>)`) to the AV Access 4KMX44-H2 module, covering routing/mute/HDCP/scaler/scene state (Tier 1), EDID (Tier 2), and static device info — model/firmware/IP (Tier 3).

**Architecture:** New `src/variables.js` follows the existing `actions.js`/`feedbacks.js`/`presets.js` pattern: a default-exported `UpdateVariables(self)` registers Companion variable definitions, plus named exports of pure `state → values` formatter functions that are unit-tested without any Companion API mock. `src/commands.js` gains the new device-reply parsing needed to populate `state.edid` and `state.deviceInfo` (EDID, IP address, IP mode, model/firmware). `src/main.js` wires it together: the Tier-3 static queries (`GET VER`, `GET IPADDR`, `GET IP Mode`) are sent **once**, serialized into the SAME single ticking timer as the round-robin poll — never via a second independent timer — because the matrix drops commands that arrive close together (confirmed on hardware: a tight burst of 4 GETs only answered 2).

**Tech Stack:** Plain JS, `@companion-module/base` v2.0.4, Node built-in test runner (`node --test`, no path argument — fails on Node 25 otherwise).

## Global Constraints

- Matrix drops back-to-back TCP queries — every command sent to the device (poll, static one-shot, or action) must be serialized through the existing single `pollTimer`/`sendCommand` path, one command per 300ms tick (`POLL_STAGGER_MS`). Never add a second independent timer that writes to the same socket.
- Reply formats below are **confirmed live** against the test unit at `192.0.2.10:23` on 2026-06-24 (read-only `GET` probes, no state changed):
  - `GET EDID all` → `EDID hdmiin1 6\r\nEDID hdmiin2 5\r\nEDID hdmiin3 5\r\nEDID hdmiin4 5\r\n` (same shape as `GET MP all`)
  - `GET IPADDR` → `IPADDR IP:192.0.2.10 MASK:255.255.255.0 GATE:192.0.2.1\r\n`
  - `GET IP Mode` → `IP MODE DHCP\r\n`
  - `GET VER` → `4KMX44-H2 VER 3.1, ARM VER 2.6\r\n`
  - The `STATIC` value for IP mode is **not** confirmed live (switching the test matrix's network mode was judged too risky to a LAN-attached device) — the mapping table includes it as a best-effort guess with a code comment flagging this.
- All boolean-style variables follow the codebase's existing null-handling convention: `value === true` (strict), so an unpolled/null state reads as the "off" word (`Unmuted`/`Off`), never a separate "unknown" string — this matches `toggle_audio_mute` and the `feedbacks.js` callbacks already in the codebase.
- André's RED-for-active convention does not apply here — variables carry no color, only feedbacks do (already shipped in v1.1).

---

### Task 1: Protocol layer — EDID state + IPADDR/IP-Mode/VER parsing in `commands.js`

**Files:**
- Modify: `src/commands.js`
- Test: `test/commands.test.js`

**Interfaces:**
- Produces: `createInitialState()` now also returns `state.edid` (`{1..4: null}`) and `state.deviceInfo` (`{model: null, firmware: null, ipAddress: null, ipMode: null}`).
- Produces: `applyReplyToState(state, reply)` now also handles `reply.keyword` of `'EDID'`, `'IPADDR'`, and `'IP'`.
- Produces: `parseVersionReply(line)` — new export, returns `{model, firmware}` or `null`.
- Produces: `buildPollCommands()` — now returns 5 commands (adds `'GET EDID all\r\n'`).
- Produces: `buildStaticInfoCommands()` — new export, returns `['GET VER\r\n', 'GET IPADDR\r\n', 'GET IP Mode\r\n']`.
- Consumes: nothing new from elsewhere in this task.

- [ ] **Step 1: Write failing tests for `createInitialState`, EDID state, and the IPADDR/IP-Mode/EDID `applyReplyToState` branches**

Append to `test/commands.test.js` (after the existing `createInitialState includes empty scene snapshots` test):

```js
test('createInitialState includes empty EDID and device-info slots', () => {
  const state = createInitialState()
  assert.deepEqual(state.edid, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.deviceInfo, { model: null, firmware: null, ipAddress: null, ipMode: null })
})

test('parseDeviceReply parses IPADDR and IP Mode replies', () => {
  assert.deepEqual(parseDeviceReply('IPADDR IP:192.0.2.10 MASK:255.255.255.0 GATE:192.0.2.1'), {
    keyword: 'IPADDR',
    target: 'IP:192.0.2.10',
    value: 'MASK:255.255.255.0',
  })
  assert.deepEqual(parseDeviceReply('IP MODE DHCP'), { keyword: 'IP', target: 'MODE', value: 'DHCP' })
})

test('applyReplyToState records EDID preset per input', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('EDID hdmiin1 6'))
  applyReplyToState(state, parseDeviceReply('EDID hdmiin2 05'))
  assert.equal(state.edid[1], 6)
  assert.equal(state.edid[2], 5)
})

test('applyReplyToState ignores EDID replies for out-of-range inputs', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('EDID hdmiin9 6'))
  assert.deepEqual(state.edid, { 1: null, 2: null, 3: null, 4: null })
})

test('applyReplyToState extracts the IP address from an IPADDR reply', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('IPADDR IP:192.0.2.10 MASK:255.255.255.0 GATE:192.0.2.1'))
  assert.equal(state.deviceInfo.ipAddress, '192.0.2.10')
})

test('applyReplyToState maps IP Mode DHCP/STATIC to display labels', () => {
  const dhcp = createInitialState()
  applyReplyToState(dhcp, parseDeviceReply('IP MODE DHCP'))
  assert.equal(dhcp.deviceInfo.ipMode, 'DHCP')

  // STATIC reply text is unconfirmed on hardware — this only checks our mapping table.
  const staticState = createInitialState()
  applyReplyToState(staticState, parseDeviceReply('IP MODE STATIC'))
  assert.equal(staticState.deviceInfo.ipMode, 'Static')
})

test('parseVersionReply extracts model and a formatted firmware string', () => {
  assert.deepEqual(parseVersionReply('4KMX44-H2 VER 3.1, ARM VER 2.6'), {
    model: '4KMX44-H2',
    firmware: 'VER 3.1 · ARM 2.6',
  })
})

test('parseVersionReply returns null for an unrecognized line', () => {
  assert.equal(parseVersionReply('GARBAGE'), null)
  assert.equal(parseVersionReply(''), null)
})

test('buildStaticInfoCommands returns the one-shot device-info queries with CRLF terminators', () => {
  assert.deepEqual(buildStaticInfoCommands(), ['GET VER\r\n', 'GET IPADDR\r\n', 'GET IP Mode\r\n'])
})
```

Also update the existing `buildPollCommands returns the read-only status queries with CRLF terminators` test (it currently asserts exactly 4 commands) to expect the new 5th EDID command:

```js
test('buildPollCommands returns the read-only status queries with CRLF terminators', () => {
  // GET MP all is the clean poll path: confirmed on hardware to use hdmiin-prefixed,
  // CRLF-separated lines (per-output GET MP returns the short "inN" form instead).
  assert.deepEqual(buildPollCommands(), [
    'GET MP all\r\n',
    'GET MUTE all\r\n',
    'GET HDCP_S all\r\n',
    'GET SCALER all\r\n',
    'GET EDID all\r\n',
  ])
})
```

Add the new imports at the top of `test/commands.test.js`:

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
  LineBuffer,
  parseDeviceReply,
  parseVersionReply,
  createInitialState,
  applyReplyToState,
  buildPollCommands,
  buildStaticInfoCommands,
  routingEquals,
} = require('../src/commands')
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `parseVersionReply is not a function` / `buildStaticInfoCommands is not a function`, and the EDID/IPADDR/IP-mode assertions fail because `commands.js` doesn't implement them yet, and the updated `buildPollCommands` test fails (still returns only 4 commands).

- [ ] **Step 3: Implement the protocol-layer changes in `src/commands.js`**

Add `edid` and `deviceInfo` to `createInitialState()`:

```js
function createInitialState() {
  return {
    routing: { 1: null, 2: null, 3: null, 4: null },
    audioMute: { 1: null, 2: null, 3: null, 4: null },
    hdcp: { 1: null, 2: null, 3: null, 4: null },
    scaler: { 1: null, 2: null, 3: null, 4: null },
    cecPower: { 1: null, 2: null, 3: null, 4: null },
    edid: { 1: null, 2: null, 3: null, 4: null },
    deviceInfo: { model: null, firmware: null, ipAddress: null, ipMode: null },
    // Learned routing snapshot per hardware scene slot (the device has no preset-query
    // API, so we learn each slot's contents when it is saved/recalled via Companion).
    scenes: { 1: null, 2: null, 3: null },
  }
}
```

Add `'IPADDR'` and `'IP'` to `KNOWN_REPLY_KEYWORDS` (`'EDID'` is already present):

```js
const KNOWN_REPLY_KEYWORDS = ['SW', 'MP', 'MUTE', 'HDCP_S', 'SCALER', 'CEC_PWR', 'PRESET', 'EDID', 'IPADDR', 'IP', 'REBOOT', 'RESET']
```

Add an `applyNumericState` helper next to `applyBoolState` (EDID stores a preset number, not a boolean):

```js
function applyNumericState(stateMap, target, value, prefix) {
  if (!target) return
  const num = parseInt(target.replace(prefix, ''), 10)
  // Ignore out-of-range targets so a stray reply can't add a phantom key.
  if (Object.prototype.hasOwnProperty.call(stateMap, num)) {
    stateMap[num] = parseInt(value, 10)
  }
}
```

Add the IP-mode label map above `applyReplyToState`:

```js
// STATIC is inferred, not confirmed on hardware — only DHCP has been observed live
// (the test matrix's network mode could not be safely switched to verify it).
const IP_MODE_LABELS = { DHCP: 'DHCP', STATIC: 'Static' }
```

Extend `applyReplyToState`'s `if/else` chain with three new branches (after the existing `CEC_PWR` branch):

```js
  } else if (keyword === 'CEC_PWR') {
    applyBoolState(state.cecPower, target, value, 'hdmiout')
  } else if (keyword === 'EDID') {
    applyNumericState(state.edid, target, value, 'hdmiin')
  } else if (keyword === 'IPADDR') {
    const match = target && target.match(/^IP:(.+)$/)
    if (match) state.deviceInfo.ipAddress = match[1]
  } else if (keyword === 'IP' && target === 'MODE') {
    state.deviceInfo.ipMode = IP_MODE_LABELS[value] ?? value
  }
```

Add `parseVersionReply` near `parseDeviceReply` (the `GET VER` reply is a free-form sentence, not the generic `KEYWORD target value` shape the rest of the protocol uses, so it gets its own parser tried independently in `main.js`):

```js
function parseVersionReply(line) {
  const match = line.trim().match(/^(\S+) VER ([\d.]+), ARM VER ([\d.]+)$/)
  if (!match) return null
  return { model: match[1], firmware: `VER ${match[2]} · ARM ${match[3]}` }
}
```

Add `'GET EDID all\r\n'` to `buildPollCommands()`:

```js
function buildPollCommands() {
  return ['GET MP all\r\n', 'GET MUTE all\r\n', 'GET HDCP_S all\r\n', 'GET SCALER all\r\n', 'GET EDID all\r\n']
}
```

Add `buildStaticInfoCommands()` next to it (sent once on connect, not part of the repeating round-robin):

```js
// One-shot device-info queries, sent once on connect (never repeated) — confirmed live
// reply shapes: GET VER → "4KMX44-H2 VER 3.1, ARM VER 2.6", GET IPADDR →
// "IPADDR IP:x MASK:x GATE:x", GET IP Mode → "IP MODE DHCP".
function buildStaticInfoCommands() {
  return ['GET VER\r\n', 'GET IPADDR\r\n', 'GET IP Mode\r\n']
}
```

Update `module.exports` at the bottom of `src/commands.js`:

```js
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
  buildPollCommands,
  buildStaticInfoCommands,
  LineBuffer,
  parseDeviceReply,
  parseVersionReply,
  createInitialState,
  applyReplyToState,
  routingEquals,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass, including every new one from Step 1 and the updated `buildPollCommands` test.

- [ ] **Step 5: Commit**

```bash
git add src/commands.js test/commands.test.js
git commit -m "feat(commands): parse EDID, IPADDR, IP Mode, and VER device replies"
```

---

### Task 2: Export `EDID_CHOICES` from `actions.js` for reuse in variables

**Files:**
- Modify: `src/actions.js`
- Test: `test/actions.test.js`

**Interfaces:**
- Produces: `require('./actions').EDID_CHOICES` — array of `{id, label}`, e.g. `{id: 6, label: '4K@60Hz 2.0ch audio With HDR'}`. Task 3 imports this to turn an EDID preset number into a human label.
- Consumes: the existing `EDID_CHOICES` constant already defined in `src/actions.js:25-38`.

- [ ] **Step 1: Write the failing test**

Add to `test/actions.test.js` (check the existing import line at the top of that file first and add `EDID_CHOICES` to the destructured `require`):

```js
test('EDID_CHOICES is exported for reuse by variables.js and matches the 12 device presets', () => {
  assert.equal(EDID_CHOICES.length, 12)
  assert.deepEqual(EDID_CHOICES[0], { id: 1, label: 'Copy from Output 1' })
  assert.deepEqual(EDID_CHOICES[11], { id: 12, label: 'Smart EDID' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `EDID_CHOICES is not defined` (or `undefined.length`) in the test file.

- [ ] **Step 3: Export it**

At the bottom of `src/actions.js`, after the existing `module.exports = function (self) { ... }`, add:

```js
module.exports.EDID_CHOICES = EDID_CHOICES
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions.js test/actions.test.js
git commit -m "feat(actions): export EDID_CHOICES for reuse by variables"
```

---

### Task 3: `src/variables.js` — pure formatters + variable definitions

**Files:**
- Create: `src/variables.js`
- Test: `test/variables.test.js`

**Interfaces:**
- Consumes: `routingEquals` from `./commands` (`src/commands.js`, exported in Task 1 already — unchanged). `EDID_CHOICES` from `./actions` (exported in Task 2).
- Consumes: `state` shape from `createInitialState()` — `state.routing`, `state.audioMute`, `state.hdcp`, `state.scaler`, `state.edid`, `state.scenes`, `state.deviceInfo` (all present after Task 1).
- Produces: `buildVariableValues(state)` → flat `{variableId: string}` object for ALL variables. Task 4 (`main.js`) calls this on every state change and passes the result to `self.setVariableValues(...)`.
- Produces: `buildVariableDefinitions()` → array of `{variableId, name}`. Task 4 calls this once via the default export.
- Produces: default export `UpdateVariables(self)` — calls `self.setVariableDefinitions(buildVariableDefinitions())` then seeds `self.setVariableValues(buildVariableValues(self.state))`. Mirrors the `module.exports = function (self) {...}` pattern already used by `actions.js`/`feedbacks.js`/`presets.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/variables.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createInitialState } = require('../src/commands')
const { buildVariableValues, buildVariableDefinitions } = require('../src/variables')

function stateWith(overrides) {
  const state = createInitialState()
  return { ...state, ...overrides }
}

test('buildVariableDefinitions declares every Tier 1/2/3 variable id exactly once', () => {
  const ids = buildVariableDefinitions().map((d) => d.variableId)
  assert.equal(new Set(ids).size, ids.length, 'no duplicate variable ids')
  for (const io of [1, 2, 3, 4]) {
    for (const id of [`out${io}_source`, `in${io}_outputs`, `out${io}_mute`, `in${io}_hdcp`, `out${io}_scaler`, `in${io}_edid`]) {
      assert.ok(ids.includes(id), `missing ${id}`)
    }
  }
  for (const id of ['routing_summary', 'active_scene', 'model', 'firmware', 'ip_address', 'ip_mode']) {
    assert.ok(ids.includes(id), `missing ${id}`)
  }
})

test('out*_source reports the feeding input, or "none" when unrouted', () => {
  const state = stateWith({ routing: { 1: 3, 2: null, 3: 3, 4: 4 } })
  const values = buildVariableValues(state)
  assert.equal(values.out1_source, 'IN3')
  assert.equal(values.out2_source, 'none')
  assert.equal(values.out4_source, 'IN4')
})

test('in*_outputs lists the outputs an input feeds, or "-" when none', () => {
  const state = stateWith({ routing: { 1: 3, 2: 1, 3: 3, 4: 4 } })
  const values = buildVariableValues(state)
  assert.equal(values.in3_outputs, '1,3')
  assert.equal(values.in1_outputs, '2')
  assert.equal(values.in2_outputs, '-')
})

test('routing_summary joins every output\'s source with the documented separator', () => {
  const state = stateWith({ routing: { 1: 3, 2: 1, 3: 3, 4: 4 } })
  assert.equal(buildVariableValues(state).routing_summary, 'OUT1←IN3 · OUT2←IN1 · OUT3←IN3 · OUT4←IN4')
})

test('out*_mute reads Muted/Unmuted; null (unpolled) reads as Unmuted', () => {
  const state = stateWith({ audioMute: { 1: true, 2: false, 3: null, 4: null } })
  const values = buildVariableValues(state)
  assert.equal(values.out1_mute, 'Muted')
  assert.equal(values.out2_mute, 'Unmuted')
  assert.equal(values.out3_mute, 'Unmuted')
})

test('in*_hdcp and out*_scaler read On/Off; null (unpolled) reads as Off', () => {
  const state = stateWith({ hdcp: { 1: true, 2: false, 3: null, 4: null }, scaler: { 1: false, 2: true, 3: null, 4: null } })
  const values = buildVariableValues(state)
  assert.equal(values.in1_hdcp, 'On')
  assert.equal(values.in3_hdcp, 'Off')
  assert.equal(values.out2_scaler, 'On')
  assert.equal(values.out3_scaler, 'Off')
})

test('active_scene reports the first slot whose learned routing matches live routing, else "none"', () => {
  const matching = stateWith({
    routing: { 1: 1, 2: 2, 3: 3, 4: 4 },
    scenes: { 1: { 1: 1, 2: 2, 3: 3, 4: 4 }, 2: null, 3: null },
  })
  assert.equal(buildVariableValues(matching).active_scene, '1')

  const none = stateWith({ routing: { 1: 1, 2: 2, 3: 3, 4: 4 }, scenes: { 1: null, 2: null, 3: null } })
  assert.equal(buildVariableValues(none).active_scene, 'none')
})

test('in*_edid maps the preset number to its human label via EDID_CHOICES; null reads as Unknown', () => {
  const state = stateWith({ edid: { 1: 6, 2: 12, 3: null, 4: 1 } })
  const values = buildVariableValues(state)
  assert.equal(values.in1_edid, '4K@60Hz 2.0ch audio With HDR')
  assert.equal(values.in2_edid, 'Smart EDID')
  assert.equal(values.in3_edid, 'Unknown')
  assert.equal(values.in4_edid, 'Copy from Output 1')
})

test('model, firmware, ip_address, ip_mode pass through deviceInfo, defaulting to empty string', () => {
  const empty = buildVariableValues(stateWith({}))
  assert.equal(empty.model, '')
  assert.equal(empty.firmware, '')
  assert.equal(empty.ip_address, '')
  assert.equal(empty.ip_mode, '')

  const filled = buildVariableValues(
    stateWith({ deviceInfo: { model: '4KMX44-H2', firmware: 'VER 3.1 · ARM 2.6', ipAddress: '192.0.2.10', ipMode: 'DHCP' } }),
  )
  assert.equal(filled.model, '4KMX44-H2')
  assert.equal(filled.firmware, 'VER 3.1 · ARM 2.6')
  assert.equal(filled.ip_address, '192.0.2.10')
  assert.equal(filled.ip_mode, 'DHCP')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/variables'`.

- [ ] **Step 3: Implement `src/variables.js`**

```js
const { routingEquals } = require('./commands')
const { EDID_CHOICES } = require('./actions')

const EDID_LABELS = Object.fromEntries(EDID_CHOICES.map((choice) => [choice.id, choice.label]))
const IO_NUMBERS = [1, 2, 3, 4]
const SCENE_SLOTS = [1, 2, 3]

function formatSource(inputNum) {
  return inputNum == null ? 'none' : `IN${inputNum}`
}

function formatOutputsForInput(routing, input) {
  const outputs = IO_NUMBERS.filter((out) => routing[out] === input)
  return outputs.length ? outputs.join(',') : '-'
}

function formatRoutingSummary(routing) {
  return IO_NUMBERS.map((out) => `OUT${out}←${formatSource(routing[out])}`).join(' · ')
}

// Matches the codebase's existing strict `=== true` convention (see toggle_audio_mute,
// feedbacks.js) — an unpolled/null value reads as the "off" word, never a third "unknown" state.
function formatOnOff(value) {
  return value === true ? 'On' : 'Off'
}

function formatMute(value) {
  return value === true ? 'Muted' : 'Unmuted'
}

function formatActiveScene(state) {
  for (const slot of SCENE_SLOTS) {
    if (routingEquals(state.scenes[slot], state.routing)) return String(slot)
  }
  return 'none'
}

function formatEdid(presetId) {
  return EDID_LABELS[presetId] ?? 'Unknown'
}

function buildVariableValues(state) {
  const values = {}

  for (const io of IO_NUMBERS) {
    values[`out${io}_source`] = formatSource(state.routing[io])
    values[`in${io}_outputs`] = formatOutputsForInput(state.routing, io)
    values[`out${io}_mute`] = formatMute(state.audioMute[io])
    values[`in${io}_hdcp`] = formatOnOff(state.hdcp[io])
    values[`out${io}_scaler`] = formatOnOff(state.scaler[io])
    values[`in${io}_edid`] = formatEdid(state.edid[io])
  }

  values.routing_summary = formatRoutingSummary(state.routing)
  values.active_scene = formatActiveScene(state)

  values.model = state.deviceInfo.model ?? ''
  values.firmware = state.deviceInfo.firmware ?? ''
  values.ip_address = state.deviceInfo.ipAddress ?? ''
  values.ip_mode = state.deviceInfo.ipMode ?? ''

  return values
}

function buildVariableDefinitions() {
  const definitions = []
  for (const io of IO_NUMBERS) {
    definitions.push({ variableId: `out${io}_source`, name: `Output ${io}: source input` })
    definitions.push({ variableId: `in${io}_outputs`, name: `Input ${io}: fed outputs` })
    definitions.push({ variableId: `out${io}_mute`, name: `Output ${io}: mute state` })
    definitions.push({ variableId: `in${io}_hdcp`, name: `Input ${io}: HDCP state` })
    definitions.push({ variableId: `out${io}_scaler`, name: `Output ${io}: scaler state` })
    definitions.push({ variableId: `in${io}_edid`, name: `Input ${io}: EDID preset` })
  }
  definitions.push({ variableId: 'routing_summary', name: 'Routing summary (all outputs)' })
  definitions.push({ variableId: 'active_scene', name: 'Active scene slot' })
  definitions.push({ variableId: 'model', name: 'Device model' })
  definitions.push({ variableId: 'firmware', name: 'Firmware version' })
  definitions.push({ variableId: 'ip_address', name: 'IP address' })
  definitions.push({ variableId: 'ip_mode', name: 'IP mode (DHCP/Static)' })
  return definitions
}

module.exports = function (self) {
  self.setVariableDefinitions(buildVariableDefinitions())
  self.setVariableValues(buildVariableValues(self.state))
}

module.exports.buildVariableValues = buildVariableValues
module.exports.buildVariableDefinitions = buildVariableDefinitions
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all new `test/variables.test.js` tests, and no regressions in the rest of the suite.

- [ ] **Step 5: Commit**

```bash
git add src/variables.js test/variables.test.js
git commit -m "feat(variables): add Tier 1/2/3 Companion variables with pure formatters"
```

---

### Task 4: Wire variables + Tier-3 one-shot queries into `main.js`

**Files:**
- Modify: `src/main.js`
- Test: `test/main.test.js`

**Interfaces:**
- Consumes: `buildStaticInfoCommands`, `parseVersionReply` from `./commands` (Task 1). `UpdateVariables` (default export) and `buildVariableValues` from `./variables` (Task 3).
- Produces: `ModuleInstance.prototype.updateVariables` — new method, called once from `init()`.
- Produces: changed behavior of `ModuleInstance.prototype.startPolling` — now sends the 3 static queries once, THEN round-robins the (now 5) poll commands forever, all through the single existing timer.

This task **replaces** the existing `'startPolling sends one poll command per tick, round-robin; stopPolling halts it'` test in `test/main.test.js` — the old test asserted a 4-command immediate round-robin with no boot sequence; that behavior is intentionally changing.

- [ ] **Step 1: Write the failing test (replacing the old polling test)**

In `test/main.test.js`, **replace** the entire `test('startPolling sends one poll command per tick, round-robin; stopPolling halts it', ...)` block with:

```js
test('startPolling sends the one-shot static queries once, then round-robins the poll commands forever', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const sent = []
  const inst = Object.create(ModuleInstance.prototype)
  inst.sendCommand = (c) => sent.push(c)

  inst.startPolling()
  // Primes only the FIRST command synchronously — the matrix drops back-to-back queries.
  assert.deepEqual(sent, ['GET VER\r\n'])

  // Advance through the 3 static one-shots + two full cycles of the 5 poll commands.
  t.mock.timers.tick(12 * 300)
  assert.deepEqual(sent, [
    'GET VER\r\n',
    'GET IPADDR\r\n',
    'GET IP Mode\r\n',
    'GET MP all\r\n',
    'GET MUTE all\r\n',
    'GET HDCP_S all\r\n',
    'GET SCALER all\r\n',
    'GET EDID all\r\n',
    'GET MP all\r\n',
    'GET MUTE all\r\n',
    'GET HDCP_S all\r\n',
    'GET SCALER all\r\n',
    'GET EDID all\r\n',
  ])

  inst.stopPolling()
  const countAfterStop = sent.length
  t.mock.timers.tick(10 * 300)
  assert.equal(sent.length, countAfterStop, 'no commands sent after stopPolling')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `sent` only contains the old 4-command round-robin sequence (`startPolling` hasn't been changed yet).

- [ ] **Step 3: Implement the `main.js` changes**

Update the imports at the top of `src/main.js`:

```js
const { InstanceBase, Regex, InstanceStatus, TCPHelper } = require('@companion-module/base')
const {
  LineBuffer,
  parseDeviceReply,
  parseVersionReply,
  createInitialState,
  applyReplyToState,
  buildPollCommands,
  buildStaticInfoCommands,
} = require('./commands')
const UpdateActions = require('./actions')
const UpdatePresets = require('./presets')
const UpdateFeedbacks = require('./feedbacks')
const { FEEDBACK_IDS } = require('./feedbacks')
const UpdateVariables = require('./variables')
const { buildVariableValues } = require('./variables')
```

Add `this.updateVariables()` to `init()`:

```js
  async init(config) {
    this.config = config
    this.state = createInitialState()

    this.updateActions()
    this.updateFeedbacks()
    this.updatePresets()
    this.updateVariables()

    this.initTcp()
  }
```

Update the `data` handler to try `parseVersionReply` as a fallback when `parseDeviceReply` doesn't recognize the line, and to push variable values whenever state changes:

```js
    this.socket.on('data', (chunk) => {
      const lines = this.lineBuffer.push(chunk.toString('latin1'))
      let changed = false
      let routingChanged = false
      for (const line of lines) {
        const reply = parseDeviceReply(line)
        if (reply) {
          applyReplyToState(this.state, reply)
          changed = true
          if (reply.keyword === 'SW' || reply.keyword === 'MP') routingChanged = true
        } else {
          // GET VER's reply is a free-form sentence ("4KMX44-H2 VER 3.1, ARM VER 2.6"),
          // not the generic KEYWORD/target/value shape parseDeviceReply expects.
          const version = parseVersionReply(line)
          if (version) {
            Object.assign(this.state.deviceInfo, version)
            changed = true
          }
        }
      }
      this.maybeLearnScene(routingChanged)
      if (changed) {
        this.checkFeedbacks(...FEEDBACK_IDS)
        this.setVariableValues(buildVariableValues(this.state))
      }
    })
```

Replace `startPolling()` to send the static info queries once, then round-robin the poll commands forever — all through the same single timer so two commands can never collide on the wire:

```js
  startPolling() {
    this.stopPolling()
    const staticCommands = buildStaticInfoCommands()
    const pollCommands = buildPollCommands()
    let i = 0
    const tick = () => {
      if (i < staticCommands.length) {
        this.sendCommand(staticCommands[i])
      } else {
        this.sendCommand(pollCommands[(i - staticCommands.length) % pollCommands.length])
      }
      i++
    }
    tick() // prime the first command immediately, then one per tick
    this.pollTimer = setInterval(tick, POLL_STAGGER_MS)
  }
```

Add the `updateVariables()` method next to `updatePresets()`:

```js
  updateVariables() {
    UpdateVariables(this)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — full suite green, including the rewritten polling test.

- [ ] **Step 5: Commit**

```bash
git add src/main.js test/main.test.js
git commit -m "feat(main): wire variables + one-shot Tier-3 static queries into polling"
```

---

### Task 5: Verify against the live matrix

**Files:** none (manual verification + redeploy of the existing rsync dev workflow).

- [ ] **Step 1: Re-run the full suite once more from a clean tree**

Run: `npm test`
Expected: all tests pass (this should already be true after Task 4 — this is a final sanity check before touching hardware).

- [ ] **Step 2: Redeploy to the Companion dev module folder**

Run (exact command from `SETUP-NEXT-STEPS.md` Step 2 — dev folder MUST be a real copy, never a symlink, or Companion's Node sandbox blocks it):

```bash
rsync -a --delete \
  --exclude='.git' --exclude='.claude' --exclude='.superpowers' \
  --exclude='docs' --exclude='test' --exclude='*.log' \
  /Users/drean/Ponyhof/companion-module-avaccess-4kmx44/ \
  ~/companion-dev-modules/companion-module-avaccess-4kmx44/
```

- [ ] **Step 3: Toggle the connection in Companion and confirm on real hardware**

In Companion's web UI: disable then re-enable the `4kmx44-h2` connection (or restart Companion) so the new module code loads. Then check, against the live matrix at `192.0.2.10:23`:
- The connection's **Variables** tab lists all Tier 1/2/3 variables.
- `out1_source`..`out4_source` and `routing_summary` reflect live routing (switch an input/output via an existing preset and confirm the variable updates within ~1.5s, the round-robin period).
- `out1_mute`..`out4_mute`, `in1_hdcp`..`in4_hdcp`, `out1_scaler`..`out4_scaler` track live toggles.
- `active_scene` shows the right slot after a Save/Recall, and `none` otherwise.
- `in1_edid`..`in4_edid` show human labels (not raw numbers).
- `model`, `firmware`, `ip_address`, `ip_mode` are populated shortly after connect (within the first ~3 ticks, ~900ms) and read `4KMX44-H2`, `VER 3.1 · ARM 2.6`, `192.0.2.10`, `DHCP` respectively on the test unit.

- [ ] **Step 4: Record the outcome**

If everything in Step 3 checks out, no code change is needed — proceed to Task 6. If anything is off, note the exact discrepancy (raw reply text, expected vs. actual variable value) and fix it as a small follow-up commit (new failing test → fix → passing test → commit), following the same TDD cycle as the earlier tasks.

---

### Task 6: Close out the session

**Files:**
- Create: `/Users/drean/Ponyhof/docs/handoffs/handoff-2026-06-24-companion-avaccess-4kmx44-variables.md` (workspace-root handoff convention, NOT inside the module's own repo — matches the existing handoffs read at the start of this session).

- [ ] **Step 1: Write the handoff doc**

Summarize: what variables were added (Tier 1/2/3, exact ids), the confirmed-live reply formats for EDID/IPADDR/IP-Mode/VER, the STATIC ip_mode caveat (inferred, not confirmed), the polling sequence change (3 one-shot static queries + 5-command round-robin, all serialized through one timer), and the final test count. Note any deviation found in Task 5 Step 3/4.

- [ ] **Step 2: Commit and push**

```bash
git -C /Users/drean/Ponyhof/companion-module-avaccess-4kmx44 log --oneline -6
git -C /Users/drean/Ponyhof/companion-module-avaccess-4kmx44 push
```

(The handoff doc itself lives outside the module repo at the Ponyhof workspace root, per existing convention — it is not part of this `git push`.)
