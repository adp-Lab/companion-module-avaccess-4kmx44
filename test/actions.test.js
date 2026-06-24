const test = require('node:test')
const assert = require('node:assert/strict')
const UpdateActions = require('../src/actions')
const { EDID_CHOICES } = UpdateActions

function makeFakeSelf(state) {
  const sent = []
  const actionDefs = {}
  const self = {
    state,
    sendCommand(cmd) {
      sent.push(cmd)
    },
    setActionDefinitions(defs) {
      Object.assign(actionDefs, defs)
    },
  }
  UpdateActions(self)
  return { sent, actionDefs, self }
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
  const { sent, actionDefs } = makeFakeSelf({ routing: { 1: 1, 2: 2, 3: 3, 4: 4 }, scenes: { 1: null, 2: null, 3: null } })
  await actionDefs.save_scene.callback({ options: { slot: 3 } })
  await actionDefs.recall_scene.callback({ options: { slot: 3 } })
  assert.deepEqual(sent, ['SAVE PRESET 3\r\n', 'RESTORE PRESET 3\r\n'])
})

test('save_scene snapshots the current routing into the slot (as a copy)', async () => {
  const state = { routing: { 1: 1, 2: 2, 3: 3, 4: 4 }, scenes: { 1: null, 2: null, 3: null } }
  const { self, actionDefs } = makeFakeSelf(state)
  await actionDefs.save_scene.callback({ options: { slot: 2 } })
  assert.deepEqual(self.state.scenes[2], { 1: 1, 2: 2, 3: 3, 4: 4 })
  state.routing[1] = 9 // later routing change must not mutate the stored snapshot
  assert.equal(self.state.scenes[2][1], 1)
})

test('recall_scene flags the slot to be learned from the next routing poll', async () => {
  const { self, actionDefs } = makeFakeSelf({ routing: { 1: 1, 2: 2, 3: 3, 4: 4 }, scenes: { 1: null, 2: null, 3: null } })
  await actionDefs.recall_scene.callback({ options: { slot: 3 } })
  assert.equal(self.pendingSceneLearn, 3)
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

test('toggle_audio_mute sends the opposite of the current mute state', async () => {
  const muted = makeFakeSelf({ audioMute: { 1: true, 2: null, 3: null, 4: null } })
  await muted.actionDefs.toggle_audio_mute.callback({ options: { output: 1 } })
  assert.deepEqual(muted.sent, ['SET MUTE audioout1 off\r\n'])

  const unknown = makeFakeSelf({ audioMute: { 1: null, 2: null, 3: null, 4: null } })
  await unknown.actionDefs.toggle_audio_mute.callback({ options: { output: 2 } })
  assert.deepEqual(unknown.sent, ['SET MUTE audioout2 on\r\n']) // null treated as off → turn on
})

test('toggle_hdcp sends the opposite of the current HDCP state', async () => {
  const on = makeFakeSelf({ hdcp: { 1: true, 2: null, 3: null, 4: null } })
  await on.actionDefs.toggle_hdcp.callback({ options: { input: 1 } })
  assert.deepEqual(on.sent, ['SET HDCP_S hdmiin1 off\r\n'])
})

test('toggle_scaler sends the opposite of the current scaler state', async () => {
  const off = makeFakeSelf({ scaler: { 1: false, 2: null, 3: null, 4: null } })
  await off.actionDefs.toggle_scaler.callback({ options: { output: 1 } })
  assert.deepEqual(off.sent, ['SET SCALER hdmiout1 on\r\n'])
})

test('toggle_mute_all flips all outputs based on whether every output is muted', async () => {
  const allOn = makeFakeSelf({ audioMute: { 1: true, 2: true, 3: true, 4: true } })
  await allOn.actionDefs.toggle_mute_all.callback({ options: {} })
  assert.deepEqual(allOn.sent, ['SET MUTE all off\r\n']) // all muted → unmute all

  const partial = makeFakeSelf({ audioMute: { 1: true, 2: false, 3: null, 4: null } })
  await partial.actionDefs.toggle_mute_all.callback({ options: {} })
  assert.deepEqual(partial.sent, ['SET MUTE all on\r\n']) // not all muted → mute all
})

test('all 13 actions are registered', () => {
  const { actionDefs } = makeFakeSelf()
  assert.deepEqual(
    Object.keys(actionDefs).sort(),
    [
      'recall_scene', 'reboot_matrix', 'save_scene', 'set_audio_mute',
      'set_cec_power', 'set_downscaler', 'set_edid', 'set_hdcp',
      'switch_input_to_output', 'toggle_audio_mute', 'toggle_mute_all', 'toggle_hdcp', 'toggle_scaler',
    ].sort(),
  )
})

test('EDID_CHOICES is exported for reuse by variables.js and matches the 12 device presets', () => {
  assert.equal(EDID_CHOICES.length, 12)
  assert.deepEqual(EDID_CHOICES[0], { id: 1, label: 'Copy from Output 1' })
  assert.deepEqual(EDID_CHOICES[11], { id: 12, label: 'Smart EDID' })
})
