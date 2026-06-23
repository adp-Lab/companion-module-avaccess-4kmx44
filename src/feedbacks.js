const { routingEquals } = require('./commands')

const INPUT_CHOICES = [1, 2, 3, 4].map((n) => ({ id: n, label: `Input ${n}` }))
const OUTPUT_CHOICES = [1, 2, 3, 4].map((n) => ({ id: n, label: `Output ${n}` }))
const SCENE_CHOICES = [1, 2, 3].map((n) => ({ id: n, label: `Scene ${n}` }))

// André's hard requirement: an active button is RED (Companion defaults boolean
// feedbacks to green — must override). White text reads well on red.
const ACTIVE_RED = { bgcolor: 0xff0000, color: 0xffffff }

const FEEDBACK_IDS = ['routing_active', 'scene_active', 'output_muted', 'all_outputs_muted', 'input_hdcp_on', 'output_scaler_on']

// `self.state` is maintained by the receive pipeline in main.js (poll replies →
// applyReplyToState). Callbacks are pure reads of that state.
function buildFeedbackDefinitions(self) {
  return {
    routing_active: {
      type: 'boolean',
      name: 'Routing: input is live on output (RED)',
      defaultStyle: { ...ACTIVE_RED },
      options: [
        { type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES },
        { type: 'dropdown', id: 'output', label: 'Output', default: 1, choices: OUTPUT_CHOICES },
      ],
      callback: (feedback) => self.state.routing[feedback.options.output] === feedback.options.input,
    },
    scene_active: {
      type: 'boolean',
      name: 'Scene: this stored scene matches live routing (RED)',
      defaultStyle: { ...ACTIVE_RED },
      options: [{ type: 'dropdown', id: 'slot', label: 'Scene Slot', default: 1, choices: SCENE_CHOICES }],
      // Red when the slot's learned routing equals the current routing. Black if the
      // routing has since changed, or the slot hasn't been saved/recalled via Companion.
      callback: (feedback) => routingEquals(self.state.scenes[feedback.options.slot], self.state.routing),
    },
    output_muted: {
      type: 'boolean',
      name: 'Audio: output is muted (RED)',
      defaultStyle: { ...ACTIVE_RED },
      options: [{ type: 'dropdown', id: 'output', label: 'Output', default: 1, choices: OUTPUT_CHOICES }],
      callback: (feedback) => self.state.audioMute[feedback.options.output] === true,
    },
    all_outputs_muted: {
      type: 'boolean',
      name: 'Audio: all outputs are muted (RED)',
      defaultStyle: { ...ACTIVE_RED },
      options: [],
      callback: () => [1, 2, 3, 4].every((o) => self.state.audioMute[o] === true),
    },
    input_hdcp_on: {
      type: 'boolean',
      name: 'HDCP: input has HDCP enabled (RED)',
      defaultStyle: { ...ACTIVE_RED },
      options: [{ type: 'dropdown', id: 'input', label: 'Input', default: 1, choices: INPUT_CHOICES }],
      callback: (feedback) => self.state.hdcp[feedback.options.input] === true,
    },
    output_scaler_on: {
      type: 'boolean',
      name: 'Scaler: output downscaler is on (RED)',
      defaultStyle: { ...ACTIVE_RED },
      options: [{ type: 'dropdown', id: 'output', label: 'Output', default: 1, choices: OUTPUT_CHOICES }],
      callback: (feedback) => self.state.scaler[feedback.options.output] === true,
    },
  }
}

module.exports = function (self) {
  self.setFeedbackDefinitions(buildFeedbackDefinitions(self))
}

module.exports.buildFeedbackDefinitions = buildFeedbackDefinitions
module.exports.FEEDBACK_IDS = FEEDBACK_IDS
// Shared so presets can apply the SAME red as the feedback's defaultStyle. A preset
// boolean-feedback MUST carry its own `style` (the definition's defaultStyle is only the
// editor pre-fill, not inherited by preset-created feedbacks).
module.exports.ACTIVE_RED = ACTIVE_RED
