const test = require('node:test')
const assert = require('node:assert/strict')
const {
  generateRoutingPresets,
  generateScenePresets,
  generateMutePresets,
  generateHdcpPresets,
  generateScalerPresets,
  generateCecPresets,
  generateSystemPresets,
} = require('../src/presets')

test('generateRoutingPresets produces all 16 input/output combinations, output-first ordering', () => {
  const presets = generateRoutingPresets()
  assert.equal(Object.keys(presets).length, 16)
  assert.deepEqual(presets.route_in1_out1.steps[0].down[0], {
    actionId: 'switch_input_to_output',
    options: { input: 1, output: 1 },
  })
  assert.equal(presets.route_in1_out1.name, 'OUT1 ⇧ IN1')
  // Output-first: OUT on the top line, "⇧ IN" (hollow up-arrow) on the second line.
  assert.equal(presets.route_in1_out2.style.size, '24')
  assert.equal(presets.route_in1_out2.style.text, 'OUT2\\n⇧ IN1')
  assert.equal(presets.route_in4_out4.steps[0].down[0].options.input, 4)
  // Palette order groups by output: OUT1/IN1-4, then OUT2/IN1-4, …
  assert.deepEqual(Object.keys(presets).slice(0, 5), [
    'route_in1_out1', 'route_in2_out1', 'route_in3_out1', 'route_in4_out1', 'route_in1_out2',
  ])
})

test('routing presets carry a routing_active feedback WITH a red style bound to input/output', () => {
  const presets = generateRoutingPresets()
  // A preset boolean-feedback MUST embed its own style — defaultStyle is not inherited.
  assert.deepEqual(presets.route_in3_out1.feedbacks, [
    { feedbackId: 'routing_active', options: { input: 3, output: 1 }, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])
  assert.deepEqual(presets.route_in4_out4.feedbacks, [
    { feedbackId: 'routing_active', options: { input: 4, output: 4 }, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])
})

test('per-channel status presets toggle their channel and go RED when active', () => {
  const mute = generateMutePresets()
  assert.deepEqual(mute.mute_out2.steps[0].down[0], { actionId: 'toggle_audio_mute', options: { output: 2 } })
  assert.deepEqual(mute.mute_out2.feedbacks, [
    { feedbackId: 'output_muted', options: { output: 2 }, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])

  const hdcp = generateHdcpPresets()
  assert.equal(Object.keys(hdcp).length, 4)
  assert.deepEqual(hdcp.hdcp_in3.steps[0].down[0], { actionId: 'toggle_hdcp', options: { input: 3 } })
  assert.deepEqual(hdcp.hdcp_in3.feedbacks, [
    { feedbackId: 'input_hdcp_on', options: { input: 3 }, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])

  const scaler = generateScalerPresets()
  assert.equal(Object.keys(scaler).length, 4)
  assert.deepEqual(scaler.scaler_out4.steps[0].down[0], { actionId: 'toggle_scaler', options: { output: 4 } })
  assert.deepEqual(scaler.scaler_out4.feedbacks, [
    { feedbackId: 'output_scaler_on', options: { output: 4 }, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])
})

test('mute section holds the 4 per-output toggles plus toggle-all and explicit set on/off', () => {
  const mute = generateMutePresets()
  assert.deepEqual(
    Object.keys(mute).sort(),
    ['mute_out1', 'mute_out2', 'mute_out3', 'mute_out4', 'mute_all_toggle', 'mute_all', 'unmute_all'].sort(),
  )
  // Toggle-all: flips every output, RED when ALL are muted.
  assert.deepEqual(mute.mute_all_toggle.steps[0].down[0], { actionId: 'toggle_mute_all', options: {} })
  assert.deepEqual(mute.mute_all_toggle.feedbacks, [
    { feedbackId: 'all_outputs_muted', options: {}, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])
  // Explicit set on/off (moved in from Convenience), no feedback.
  assert.deepEqual(mute.mute_all.steps[0].down[0], { actionId: 'set_audio_mute', options: { output: 'all', state: 'on' } })
  assert.deepEqual(mute.unmute_all.steps[0].down[0], { actionId: 'set_audio_mute', options: { output: 'all', state: 'off' } })
})

test('every preset feedback embeds a non-empty style (preset boolean-feedbacks require it)', () => {
  const all = {
    ...generateRoutingPresets(),
    ...generateScenePresets(),
    ...generateMutePresets(),
    ...generateHdcpPresets(),
    ...generateScalerPresets(),
    ...generateCecPresets(),
    ...generateSystemPresets(),
  }
  for (const [id, preset] of Object.entries(all)) {
    for (const fb of preset.feedbacks) {
      assert.ok(
        fb.style && Object.keys(fb.style).length > 0,
        `preset ${id} feedback ${fb.feedbackId} is missing a style`,
      )
    }
  }
})

test('generateScenePresets produces save+recall buttons for slots 1-3', () => {
  const presets = generateScenePresets()
  assert.deepEqual(
    Object.keys(presets).sort(),
    ['recall_scene_1', 'recall_scene_2', 'recall_scene_3', 'save_scene_1', 'save_scene_2', 'save_scene_3'].sort(),
  )
  assert.deepEqual(presets.save_scene_1.steps[0][500][0], { actionId: 'save_scene', options: { slot: 1 } })
  assert.deepEqual(presets.recall_scene_3.steps[0].down[0], { actionId: 'recall_scene', options: { slot: 3 } })
  assert.equal(presets.save_scene_2.style.text, 'SAVE\\n2')
  assert.equal(presets.recall_scene_2.style.text, 'LOAD\\n2')
})

test('SAVE presets only fire after a 500ms hold (long-press group), not on a quick tap', () => {
  const step = generateScenePresets().save_scene_2.steps[0]
  assert.deepEqual(step.down, []) // quick press: nothing
  assert.deepEqual(step.up, []) // short-press release: nothing
  assert.deepEqual(step[500], [{ actionId: 'save_scene', options: { slot: 2 } }]) // ≥500ms hold: save
})

test('LOAD presets carry a scene_active feedback (red); SAVE presets carry none', () => {
  const presets = generateScenePresets()
  assert.deepEqual(presets.recall_scene_2.feedbacks, [
    { feedbackId: 'scene_active', options: { slot: 2 }, style: { bgcolor: 0xff0000, color: 0xffffff } },
  ])
  assert.deepEqual(presets.save_scene_2.feedbacks, [])
})

test('CEC presets send power commands and carry no feedback (CEC power is not queryable)', () => {
  const cec = generateCecPresets()
  assert.deepEqual(cec.cec_on_all.steps[0].down[0], { actionId: 'set_cec_power', options: { output: 'all', state: 'on' } })
  assert.deepEqual(cec.cec_off_all.steps[0].down[0], { actionId: 'set_cec_power', options: { output: 'all', state: 'off' } })
  assert.deepEqual(cec.cec_on_out1.steps[0].down[0], { actionId: 'set_cec_power', options: { output: '1', state: 'on' } })
  assert.deepEqual(cec.cec_off_out4.steps[0].down[0], { actionId: 'set_cec_power', options: { output: '4', state: 'off' } })
  assert.equal(Object.keys(cec).length, 10) // All on/off + 4 outputs × on/off
  for (const p of Object.values(cec)) assert.deepEqual(p.feedbacks, [])
})

test('generateSystemPresets holds only the reboot button (its own category)', () => {
  const presets = generateSystemPresets()
  assert.deepEqual(Object.keys(presets), ['reboot_matrix'])
  assert.deepEqual(presets.reboot_matrix.steps[0].down[0], { actionId: 'reboot_matrix', options: {} })
})
