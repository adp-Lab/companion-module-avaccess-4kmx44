// Button text uses a literal "\n" for the line break (e.g. IN1→\nOUT2), matching
// how Companion's button text field renders it — confirmed on hardware 2026-06-23.

const { ACTIVE_RED } = require('./feedbacks')

function generateRoutingPresets() {
  const presets = {}
  // Output-first ordering: OUT1 with IN1-4, then OUT2 with IN1-4, … (André routes
  // from the output side).
  for (let output = 1; output <= 4; output++) {
    for (let input = 1; input <= 4; input++) {
      presets[`route_in${input}_out${output}`] = {
        type: 'simple',
        // Output-first labelling: OUT on top, "⇧ IN" below (hollow up-arrow = this
        // output is currently fed from this input).
        name: `OUT${output} ⇧ IN${input}`,
        style: {
          text: `OUT${output}\\n⇧ IN${input}`,
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
        // Live RED when this input is the one currently routed to this output.
        // The style is required on the preset feedback (defaultStyle is not inherited).
        feedbacks: [{ feedbackId: 'routing_active', options: { input, output }, style: { ...ACTIVE_RED } }],
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
      name: `Save Scene ${slot} (hold 0.5s)`,
      style: { text: `SAVE\\n${slot}`, size: '24', color: 0xffffff, bgcolor: 0x0000aa },
      // Guard against accidental "save over": a quick tap (down/up) does nothing; the
      // save only runs after the button is held ≥500ms (the 500ms long-press group).
      steps: [{ down: [], up: [], 500: [{ actionId: 'save_scene', options: { slot } }] }],
      feedbacks: [],
    }
    presets[`recall_scene_${slot}`] = {
      type: 'simple',
      name: `Recall Scene ${slot}`,
      style: { text: `LOAD\\n${slot}`, size: '24', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId: 'recall_scene', options: { slot } }], up: [] }],
      // RED when this stored scene's routing matches the live routing (the active scene).
      feedbacks: [{ feedbackId: 'scene_active', options: { slot }, style: { ...ACTIVE_RED } }],
    }
  }
  return presets
}

function generateSystemPresets() {
  return {
    reboot_matrix: {
      type: 'simple',
      name: 'Reboot Matrix',
      style: { text: 'REBOOT', size: '14', color: 0xffffff, bgcolor: 0xcc0000 },
      steps: [{ down: [{ actionId: 'reboot_matrix', options: {} }], up: [] }],
      feedbacks: [],
    },
  }
}

// Status presets: one toggle button per channel that goes RED when active. Each preset
// feedback carries its own style (defaultStyle is not inherited by preset feedbacks).
function statusPreset(key, name, text, actionId, optKey, optVal, feedbackId) {
  return {
    [key]: {
      type: 'simple',
      name,
      style: { text, size: '18', color: 0xffffff, bgcolor: 0x000000 },
      steps: [{ down: [{ actionId, options: { [optKey]: optVal } }], up: [] }],
      feedbacks: [{ feedbackId, options: { [optKey]: optVal }, style: { ...ACTIVE_RED } }],
    },
  }
}

function generateMutePresets() {
  let presets = {}
  for (let output = 1; output <= 4; output++) {
    presets = { ...presets, ...statusPreset(`mute_out${output}`, `Mute OUT${output}`, `MUTE\\nOUT${output}`, 'toggle_audio_mute', 'output', output, 'output_muted') }
  }
  // Toggle-all button: flips every output, RED when all four are muted.
  presets.mute_all_toggle = {
    type: 'simple',
    name: 'Toggle Mute All',
    style: { text: 'MUTE\\nALL', size: '18', color: 0xffffff, bgcolor: 0x000000 },
    steps: [{ down: [{ actionId: 'toggle_mute_all', options: {} }], up: [] }],
    feedbacks: [{ feedbackId: 'all_outputs_muted', options: {}, style: { ...ACTIVE_RED } }],
  }
  // Explicit set-on / set-off, moved here from Convenience.
  presets.mute_all = {
    type: 'simple',
    name: 'Mute All',
    style: { text: 'MUTE\\nALL ON', size: '18', color: 0xffffff, bgcolor: 0x000000 },
    steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'on' } }], up: [] }],
    feedbacks: [],
  }
  presets.unmute_all = {
    type: 'simple',
    name: 'Unmute All',
    style: { text: 'MUTE\\nALL OFF', size: '18', color: 0xffffff, bgcolor: 0x000000 },
    steps: [{ down: [{ actionId: 'set_audio_mute', options: { output: 'all', state: 'off' } }], up: [] }],
    feedbacks: [],
  }
  return presets
}

function generateHdcpPresets() {
  let presets = {}
  for (let input = 1; input <= 4; input++) {
    presets = { ...presets, ...statusPreset(`hdcp_in${input}`, `HDCP IN${input}`, `HDCP\\nIN${input}`, 'toggle_hdcp', 'input', input, 'input_hdcp_on') }
  }
  return presets
}

function generateScalerPresets() {
  let presets = {}
  for (let output = 1; output <= 4; output++) {
    presets = { ...presets, ...statusPreset(`scaler_out${output}`, `Scaler OUT${output}`, `SCALE\\nOUT${output}`, 'toggle_scaler', 'output', output, 'output_scaler_on') }
  }
  return presets
}

// CEC display power: one-shot ON/OFF per output + All. No feedback — the device has no
// GET for CEC power (you can't read a display's power state back).
function cecPreset(key, label, output, state) {
  const on = state === 'on'
  return {
    [key]: {
      type: 'simple',
      name: label,
      style: { text: `CEC ${on ? 'ON' : 'OFF'}\\n${output === 'all' ? 'ALL' : `OUT${output}`}`, size: '18', color: 0xffffff, bgcolor: on ? 0x006600 : 0x222222 },
      steps: [{ down: [{ actionId: 'set_cec_power', options: { output, state } }], up: [] }],
      feedbacks: [],
    },
  }
}

function generateCecPresets() {
  let presets = {
    ...cecPreset('cec_on_all', 'CEC Power On (All)', 'all', 'on'),
    ...cecPreset('cec_off_all', 'CEC Power Off (All)', 'all', 'off'),
  }
  for (let output = 1; output <= 4; output++) {
    presets = {
      ...presets,
      ...cecPreset(`cec_on_out${output}`, `CEC Power On OUT${output}`, String(output), 'on'),
      ...cecPreset(`cec_off_out${output}`, `CEC Power Off OUT${output}`, String(output), 'off'),
    }
  }
  return presets
}

module.exports = function (self) {
  const routingPresets = generateRoutingPresets()
  const scenePresets = generateScenePresets()
  const mutePresets = generateMutePresets()
  const hdcpPresets = generateHdcpPresets()
  const scalerPresets = generateScalerPresets()
  const cecPresets = generateCecPresets()
  const systemPresets = generateSystemPresets()
  const presets = {
    ...routingPresets,
    ...scenePresets,
    ...mutePresets,
    ...hdcpPresets,
    ...scalerPresets,
    ...cecPresets,
    ...systemPresets,
  }

  const structure = [
    { id: 'routing', name: 'Routing', definitions: Object.keys(routingPresets) },
    { id: 'scenes', name: 'Scenes', definitions: Object.keys(scenePresets) },
    { id: 'mute', name: 'Mute', definitions: Object.keys(mutePresets) },
    { id: 'hdcp', name: 'HDCP', definitions: Object.keys(hdcpPresets) },
    { id: 'scaler', name: 'Scaler', definitions: Object.keys(scalerPresets) },
    { id: 'cec', name: 'CEC', definitions: Object.keys(cecPresets) },
    { id: 'system', name: 'System', definitions: Object.keys(systemPresets) },
  ]

  self.setPresetDefinitions(structure, presets)
}

module.exports.generateRoutingPresets = generateRoutingPresets
module.exports.generateScenePresets = generateScenePresets
module.exports.generateMutePresets = generateMutePresets
module.exports.generateHdcpPresets = generateHdcpPresets
module.exports.generateScalerPresets = generateScalerPresets
module.exports.generateCecPresets = generateCecPresets
module.exports.generateSystemPresets = generateSystemPresets
