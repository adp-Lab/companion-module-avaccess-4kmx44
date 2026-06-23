// Button text uses a literal "\n" for the line break (e.g. IN1→\nOUT2), matching
// how Companion's button text field renders it — confirmed on hardware 2026-06-23.

function generateRoutingPresets() {
  const presets = {}
  for (let input = 1; input <= 4; input++) {
    for (let output = 1; output <= 4; output++) {
      presets[`route_in${input}_out${output}`] = {
        type: 'simple',
        name: `IN${input}→OUT${output}`,
        style: {
          text: `IN${input}→\\nOUT${output}`,
          size: '24',
          color: 0xffffff,
          bgcolor: 0x000000,
        },
        steps: [
          {
            down: [{ actionId: 'switch_input_to_output', options: { input, output } }],
            up: [],
          },
        ],
        feedbacks: [],
      }
    }
  }
  return presets
}

function generateScenePresets() {
  const presets = {}
  for (let slot = 1; slot <= 3; slot++) {
    presets[`save_scene_${slot}`] = {
      type: 'simple',
      name: `Save Scene ${slot}`,
      style: { text: `SAVE\\n${slot}`, size: '24', color: 0xffffff, bgcolor: 0x0000aa },
      steps: [{ down: [{ actionId: 'save_scene', options: { slot } }], up: [] }],
      feedbacks: [],
    }
    presets[`recall_scene_${slot}`] = {
      type: 'simple',
      name: `Recall Scene ${slot}`,
      style: { text: `LOAD\\n${slot}`, size: '24', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'recall_scene', options: { slot } }], up: [] }],
      feedbacks: [],
    }
  }
  return presets
}

function generateConveniencePresets() {
  return {
    reboot_matrix: {
      type: 'simple',
      name: 'Reboot Matrix',
      style: { text: 'REBOOT', size: '14', color: 0xffffff, bgcolor: 0xcc0000 },
      steps: [{ down: [{ actionId: 'reboot_matrix', options: {} }], up: [] }],
      feedbacks: [],
    },
    mute_all: {
      type: 'simple',
      name: 'Mute All',
      style: { text: 'MUTE\\nALL', size: '18', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'on' } }], up: [] }],
      feedbacks: [],
    },
    unmute_all: {
      type: 'simple',
      name: 'Unmute All',
      style: { text: 'UNMUTE\\nALL', size: '18', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'off' } }], up: [] }],
      feedbacks: [],
    },
  }
}

module.exports = function (self) {
  const routingPresets = generateRoutingPresets()
  const scenePresets = generateScenePresets()
  const conveniencePresets = generateConveniencePresets()
  const presets = { ...routingPresets, ...scenePresets, ...conveniencePresets }

  const structure = [
    { id: 'routing', name: 'Routing', definitions: Object.keys(routingPresets) },
    { id: 'scenes', name: 'Scenes', definitions: Object.keys(scenePresets) },
    { id: 'convenience', name: 'Convenience', definitions: Object.keys(conveniencePresets) },
  ]

  self.setPresetDefinitions(structure, presets)
}

module.exports.generateRoutingPresets = generateRoutingPresets
module.exports.generateScenePresets = generateScenePresets
module.exports.generateConveniencePresets = generateConveniencePresets
