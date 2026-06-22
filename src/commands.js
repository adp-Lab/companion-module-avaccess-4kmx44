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
