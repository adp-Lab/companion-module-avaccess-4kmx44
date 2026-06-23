const test = require('node:test')
const assert = require('node:assert/strict')
const { generateRoutingPresets, generateScenePresets, generateConveniencePresets } = require('../src/presets')

test('generateRoutingPresets produces all 16 input/output combinations with 24pt two-line text', () => {
  const presets = generateRoutingPresets()
  assert.equal(Object.keys(presets).length, 16)
  assert.deepEqual(presets.route_in1_out1.steps[0].down[0], {
    actionId: 'switch_input_to_output',
    options: { input: 1, output: 1 },
  })
  assert.equal(presets.route_in1_out1.name, 'IN1→OUT1')
  // 24pt, with a literal "\n" line break: IN1→\nOUT2 style
  assert.equal(presets.route_in1_out2.style.size, '24')
  assert.equal(presets.route_in1_out2.style.text, 'IN1→\\nOUT2')
  assert.equal(presets.route_in4_out4.steps[0].down[0].options.input, 4)
})

test('generateScenePresets produces save+recall buttons for slots 1-3', () => {
  const presets = generateScenePresets()
  assert.deepEqual(
    Object.keys(presets).sort(),
    ['recall_scene_1', 'recall_scene_2', 'recall_scene_3', 'save_scene_1', 'save_scene_2', 'save_scene_3'].sort(),
  )
  assert.deepEqual(presets.save_scene_1.steps[0].down[0], { actionId: 'save_scene', options: { slot: 1 } })
  assert.deepEqual(presets.recall_scene_3.steps[0].down[0], { actionId: 'recall_scene', options: { slot: 3 } })
  assert.equal(presets.save_scene_2.style.text, 'SAVE\\n2')
  assert.equal(presets.recall_scene_2.style.text, 'LOAD\\n2')
})

test('generateConveniencePresets produces the reboot and mute shortcuts (scene recall moved to Scenes)', () => {
  const presets = generateConveniencePresets()
  assert.deepEqual(Object.keys(presets).sort(), ['mute_all', 'reboot_matrix', 'unmute_all'].sort())
  assert.deepEqual(presets.reboot_matrix.steps[0].down[0], { actionId: 'reboot_matrix', options: {} })
  assert.deepEqual(presets.mute_all.steps[0].down[0], {
    actionId: 'set_audio_mute',
    options: { output: 'all', state: 'on' },
  })
})
