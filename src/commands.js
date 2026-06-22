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
}
