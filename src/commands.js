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
  LineBuffer,
  parseDeviceReply,
  createInitialState,
  applyReplyToState,
}
