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
