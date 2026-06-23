const test = require('node:test')
const assert = require('node:assert/strict')
const { generateRoutingPresets, generateConveniencePresets } = require('../src/presets')

test('generateRoutingPresets produces all 16 input/output combinations', () => {
  const presets = generateRoutingPresets()
  assert.equal(Object.keys(presets).length, 16)
  assert.deepEqual(presets.route_in1_out1.steps[0].down[0], {
    actionId: 'switch_input_to_output',
    options: { input: 1, output: 1 },
  })
  assert.equal(presets.route_in1_out1.name, 'IN1→OUT1')
  assert.equal(presets.route_in4_out4.steps[0].down[0].options.input, 4)
})

test('generateConveniencePresets produces the reboot, mute, and scene-recall shortcuts', () => {
  const presets = generateConveniencePresets()
  assert.deepEqual(
    Object.keys(presets).sort(),
    ['mute_all', 'reboot_matrix', 'recall_scene_1', 'unmute_all'].sort(),
  )
  assert.deepEqual(presets.reboot_matrix.steps[0].down[0], { actionId: 'reboot_matrix', options: {} })
  assert.deepEqual(presets.mute_all.steps[0].down[0], {
    actionId: 'set_audio_mute',
    options: { output: 'all', state: 'on' },
  })
  assert.deepEqual(presets.recall_scene_1.steps[0].down[0], { actionId: 'recall_scene', options: { slot: 1 } })
})
