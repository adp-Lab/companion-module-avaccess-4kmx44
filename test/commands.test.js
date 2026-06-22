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
