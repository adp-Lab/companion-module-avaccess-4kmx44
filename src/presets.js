function generateRoutingPresets() {
  const presets = {}
  for (let input = 1; input <= 4; input++) {
    for (let output = 1; output <= 4; output++) {
      presets[`route_in${input}_out${output}`] = {
        type: 'simple',
        name: `IN${input}→OUT${output}`,
        style: {
          text: `IN${input}→OUT${output}`,
          size: '18',
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
      style: { text: 'MUTE ALL', size: '14', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'on' } }], up: [] }],
      feedbacks: [],
    },
    unmute_all: {
      type: 'simple',
      name: 'Unmute All',
      style: { text: 'UNMUTE ALL', size: '14', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'off' } }], up: [] }],
      feedbacks: [],
    },
    recall_scene_1: {
      type: 'simple',
      name: 'Recall Scene 1',
      style: { text: 'SCENE 1', size: '14', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'recall_scene', options: { slot: 1 } }], up: [] }],
      feedbacks: [],
    },
  }
}

module.exports = function (self) {
  const routingPresets = generateRoutingPresets()
  const conveniencePresets = generateConveniencePresets()
  const presets = { ...routingPresets, ...conveniencePresets }

  const structure = [
    { id: 'routing', name: 'Routing', definitions: Object.keys(routingPresets) },
    { id: 'convenience', name: 'Convenience', definitions: Object.keys(conveniencePresets) },
  ]

  self.setPresetDefinitions(structure, presets)
}

module.exports.generateRoutingPresets = generateRoutingPresets
module.exports.generateConveniencePresets = generateConveniencePresets
