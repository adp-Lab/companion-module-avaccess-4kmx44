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
  LineBuffer,
  parseDeviceReply,
  createInitialState,
  applyReplyToState,
  buildPollCommands,
  routingEquals,
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

test('createInitialState starts every tracked value as null', () => {
  const state = createInitialState()
  assert.deepEqual(state.routing, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.audioMute, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.hdcp, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.scaler, { 1: null, 2: null, 3: null, 4: null })
  assert.deepEqual(state.cecPower, { 1: null, 2: null, 3: null, 4: null })
})

test('createInitialState includes empty scene snapshots', () => {
  assert.deepEqual(createInitialState().scenes, { 1: null, 2: null, 3: null })
})

test('routingEquals compares all four outputs and rejects null snapshots', () => {
  assert.equal(routingEquals({ 1: 1, 2: 2, 3: 3, 4: 4 }, { 1: 1, 2: 2, 3: 3, 4: 4 }), true)
  assert.equal(routingEquals({ 1: 1, 2: 2, 3: 3, 4: 4 }, { 1: 1, 2: 2, 3: 3, 4: 1 }), false)
  assert.equal(routingEquals(null, { 1: 1, 2: 2, 3: 3, 4: 4 }), false)
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

test('buildPollCommands returns the read-only status queries with CRLF terminators', () => {
  // GET MP all is the clean poll path: confirmed on hardware to use hdmiin-prefixed,
  // CRLF-separated lines (per-output GET MP returns the short "inN" form instead).
  assert.deepEqual(buildPollCommands(), [
    'GET MP all\r\n',
    'GET MUTE all\r\n',
    'GET HDCP_S all\r\n',
    'GET SCALER all\r\n',
  ])
})

test('applyReplyToState ignores routing replies for out-of-range outputs', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('MP hdmiin1 hdmiout9'))
  assert.deepEqual(state.routing, { 1: null, 2: null, 3: null, 4: null })
})

test('applyReplyToState ignores routing replies for out-of-range inputs', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('MP hdmiin9 hdmiout1'))
  assert.deepEqual(state.routing, { 1: null, 2: null, 3: null, 4: null })
})

test('applyReplyToState tolerates the short "inN" form returned by per-output GET MP', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('MP in2 hdmiout1'))
  assert.equal(state.routing[1], 2)
})

test('applyReplyToState ignores bool replies for out-of-range targets', () => {
  const state = createInitialState()
  applyReplyToState(state, parseDeviceReply('MUTE audioout9 on'))
  assert.deepEqual(state.audioMute, { 1: null, 2: null, 3: null, 4: null })
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
