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

const KNOWN_REPLY_KEYWORDS = ['SW', 'MP', 'MUTE', 'HDCP_S', 'SCALER', 'CEC_PWR', 'PRESET', 'EDID', 'IPADDR', 'IP', 'REBOOT', 'RESET']

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

function parseVersionReply(line) {
  const match = line.trim().match(/^(\S+) VER ([\d.]+), ARM VER ([\d.]+)$/)
  if (!match) return null
  return { model: match[1], firmware: `VER ${match[2]} · ARM ${match[3]}` }
}

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

// True when two routing snapshots assign the same input to every output. Used by the
// scene_active feedback to light a LOAD button when live routing matches a learned slot.
function routingEquals(a, b) {
  if (!a || !b) return false
  for (const out of [1, 2, 3, 4]) {
    if (a[out] !== b[out]) return false
  }
  return true
}

// Read-only status queries used by the live-feedback poll loop. `GET MP all` is the
// clean routing path: confirmed on hardware to return hdmiin-prefixed, CRLF-separated
// lines (`MP hdmiin1 hdmiout1`). Per-output `GET MP hdmioutN` instead returns the short
// `MP inN hdmioutN` form — handled by applyReplyToState, but not used for polling.
function buildPollCommands() {
  return ['GET MP all\r\n', 'GET MUTE all\r\n', 'GET HDCP_S all\r\n', 'GET SCALER all\r\n', 'GET EDID all\r\n']
}

// One-shot device-info queries, sent once on connect (never repeated) — confirmed live
// reply shapes: GET VER → "4KMX44-H2 VER 3.1, ARM VER 2.6", GET IPADDR →
// "IPADDR IP:x MASK:x GATE:x", GET IP Mode → "IP MODE DHCP".
function buildStaticInfoCommands() {
  return ['GET VER\r\n', 'GET IPADDR\r\n', 'GET IP Mode\r\n']
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
    // Ignore out-of-range targets (e.g. audioout9) so stray replies can't add phantom keys.
    if (Object.prototype.hasOwnProperty.call(stateMap, num)) {
      stateMap[num] = value === 'on'
    }
  }
}

function applyNumericState(stateMap, target, value, prefix) {
  if (!target) return
  const num = parseInt(target.replace(prefix, ''), 10)
  // Ignore out-of-range targets so a stray reply can't add a phantom key.
  if (Object.prototype.hasOwnProperty.call(stateMap, num)) {
    stateMap[num] = parseInt(value, 10)
  }
}

// STATIC is inferred, not confirmed on hardware — only DHCP has been observed live
// (the test matrix's network mode could not be safely switched to verify it).
const IP_MODE_LABELS = { DHCP: 'DHCP', STATIC: 'Static' }

function applyReplyToState(state, reply) {
  if (!reply) return

  const { keyword, target, value } = reply

  if (keyword === 'SW' || keyword === 'MP') {
    if (!target) return
    // Accept both the long `hdmiinN` form (GET MP all / SET SW echo) and the short
    // `inN` form (per-output GET MP) observed on hardware.
    const inputNum = parseInt(target.replace(/^(hdmiin|in)/, ''), 10)
    if (Number.isNaN(inputNum) || inputNum < 1 || inputNum > 4) return

    if (value === 'all') {
      for (const out of Object.keys(state.routing)) {
        state.routing[out] = inputNum
      }
    } else if (value) {
      const outputNum = parseInt(value.replace('hdmiout', ''), 10)
      // Ignore out-of-range outputs so a stray reply can't add a phantom routing key.
      if (Object.prototype.hasOwnProperty.call(state.routing, outputNum)) {
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
  } else if (keyword === 'EDID') {
    applyNumericState(state.edid, target, value, 'hdmiin')
  } else if (keyword === 'IPADDR') {
    const match = target && target.match(/^IP:(.+)$/)
    if (match) state.deviceInfo.ipAddress = match[1]
  } else if (keyword === 'IP' && target === 'MODE') {
    state.deviceInfo.ipMode = IP_MODE_LABELS[value] ?? value
  }
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
  buildPollCommands,
  buildStaticInfoCommands,
  LineBuffer,
  parseDeviceReply,
  parseVersionReply,
  createInitialState,
  applyReplyToState,
  routingEquals,
}
