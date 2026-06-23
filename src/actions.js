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
} = require('./commands')

const INPUT_CHOICES = [1, 2, 3, 4].map((n) => ({ id: n, label: `Input ${n}` }))
const OUTPUT_CHOICES = [1, 2, 3, 4].map((n) => ({ id: n, label: `Output ${n}` }))
const OUTPUT_CHOICES_WITH_ALL = [
  ...[1, 2, 3, 4].map((n) => ({ id: String(n), label: `Output ${n}` })),
  { id: 'all', label: 'All Outputs' },
]
const ON_OFF_CHOICES = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
]
// The 4KMX44-H2 has 3 hardware scene slots (Web UI shows Save/Load 1-3), confirmed on real hardware 2026-06-23.
const SCENE_CHOICES = [1, 2, 3].map((n) => ({ id: n, label: `Scene ${n}` }))
const EDID_CHOICES = [
  { id: 1, label: 'Copy from Output 1' },
  { id: 2, label: 'Copy from Output 2' },
  { id: 3, label: 'Copy from Output 3' },
  { id: 4, label: 'Copy from Output 4' },
  { id: 5, label: '4K@60Hz 5.1ch audio With HDR' },
  { id: 6, label: '4K@60Hz 2.0ch audio With HDR' },
  { id: 7, label: '4K@30Hz 7.1ch audio With HDR' },
  { id: 8, label: '4K@30Hz 5.1ch audio With HDR' },
  { id: 9, label: '4K@30Hz 2.0ch audio With HDR' },
  { id: 10, label: '4K@30Hz/8bit only 2.0ch audio Without HDR' },
  { id: 11, label: '1080P@60Hz 2.0ch audio' },
  { id: 12, label: 'Smart EDID' },
]

module.exports = function (self) {
  self.setActionDefinitions({
    switch_input_to_output: {
      name: 'Switch Input to Output',
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'output', label: 'Output', default: 1, choices: OUTPUT_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildSwitchCommand(action.options.input, action.options.output))
      },
    },
    reboot_matrix: {
      name: 'Reboot Matrix',
      options: [],
      callback: async () => {
        self.sendCommand(buildRebootCommand())
      },
    },
    save_scene: {
      name: 'Save Hardware Scene',
      options: [{ type: 'dropdown', id: 'slot', label: 'Scene Slot', default: 1, choices: SCENE_CHOICES }],
      callback: async (action) => {
        self.sendCommand(buildSaveSceneCommand(action.options.slot))
      },
    },
    recall_scene: {
      name: 'Recall Hardware Scene',
      options: [{ type: 'dropdown', id: 'slot', label: 'Scene Slot', default: 1, choices: SCENE_CHOICES }],
      callback: async (action) => {
        self.sendCommand(buildRecallSceneCommand(action.options.slot))
      },
    },
    set_audio_mute: {
      name: 'Set Audio Mute',
      options: [
        { type: 'dropdown', id: 'output', label: 'Output', default: '1', choices: OUTPUT_CHOICES_WITH_ALL },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildMuteCommand(action.options.output, action.options.state))
      },
    },
    set_hdcp: {
      name: 'Set HDCP Support',
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildHdcpCommand(action.options.input, action.options.state))
      },
    },
    set_downscaler: {
      name: 'Set Output Downscaler',
      options: [
        { type: 'dropdown', id: 'output', label: 'Output', default: '1', choices: OUTPUT_CHOICES_WITH_ALL },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildScalerCommand(action.options.output, action.options.state))
      },
    },
    set_cec_power: {
      name: 'Set CEC Display Power',
      options: [
        { type: 'dropdown', id: 'output', label: 'Output', default: '1', choices: OUTPUT_CHOICES_WITH_ALL },
        { type: 'dropdown', id: 'state', label: 'State', default: 'on', choices: ON_OFF_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildCecPowerCommand(action.options.output, action.options.state))
      },
    },
    set_edid: {
      name: 'Set Input EDID',
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'preset', label: 'EDID Preset', default: 12, choices: EDID_CHOICES },
      ],
      callback: async (action) => {
        self.sendCommand(buildEdidCommand(action.options.input, action.options.preset))
      },
    },
  })
}
