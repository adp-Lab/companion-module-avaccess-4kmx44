const { routingEquals } = require('./commands')
const { EDID_CHOICES } = require('./actions')

const EDID_LABELS = Object.fromEntries(EDID_CHOICES.map((choice) => [choice.id, choice.label]))
const IO_NUMBERS = [1, 2, 3, 4]
const SCENE_SLOTS = [1, 2, 3]

function formatSource(inputNum) {
  return inputNum == null ? 'none' : `IN${inputNum}`
}

function formatOutputsForInput(routing, input) {
  const outputs = IO_NUMBERS.filter((out) => routing[out] === input)
  return outputs.length ? outputs.join(',') : '-'
}

function formatRoutingSummary(routing) {
  return IO_NUMBERS.map((out) => `OUT${out}←${formatSource(routing[out])}`).join(' · ')
}

// Matches the codebase's existing strict `=== true` convention (see toggle_audio_mute,
// feedbacks.js) — an unpolled/null value reads as the "off" word, never a third "unknown" state.
function formatOnOff(value) {
  return value === true ? 'On' : 'Off'
}

function formatMute(value) {
  return value === true ? 'Muted' : 'Unmuted'
}

function formatActiveScene(state) {
  for (const slot of SCENE_SLOTS) {
    if (routingEquals(state.scenes[slot], state.routing)) return String(slot)
  }
  return 'none'
}

function formatEdid(presetId) {
  return EDID_LABELS[presetId] ?? 'Unknown'
}

function buildVariableValues(state) {
  const values = {}

  for (const io of IO_NUMBERS) {
    values[`out${io}_source`] = formatSource(state.routing[io])
    values[`in${io}_outputs`] = formatOutputsForInput(state.routing, io)
    values[`out${io}_mute`] = formatMute(state.audioMute[io])
    values[`in${io}_hdcp`] = formatOnOff(state.hdcp[io])
    values[`out${io}_scaler`] = formatOnOff(state.scaler[io])
    values[`in${io}_edid`] = formatEdid(state.edid[io])
  }

  values.routing_summary = formatRoutingSummary(state.routing)
  values.active_scene = formatActiveScene(state)

  values.model = state.deviceInfo.model ?? ''
  values.firmware = state.deviceInfo.firmware ?? ''
  values.ip_address = state.deviceInfo.ipAddress ?? ''
  values.ip_mode = state.deviceInfo.ipMode ?? ''

  return values
}

function buildVariableDefinitions() {
  const definitions = []
  for (const io of IO_NUMBERS) {
    definitions.push({ variableId: `out${io}_source`, name: `Output ${io}: source input` })
    definitions.push({ variableId: `in${io}_outputs`, name: `Input ${io}: fed outputs` })
    definitions.push({ variableId: `out${io}_mute`, name: `Output ${io}: mute state` })
    definitions.push({ variableId: `in${io}_hdcp`, name: `Input ${io}: HDCP state` })
    definitions.push({ variableId: `out${io}_scaler`, name: `Output ${io}: scaler state` })
    definitions.push({ variableId: `in${io}_edid`, name: `Input ${io}: EDID preset` })
  }
  definitions.push({ variableId: 'routing_summary', name: 'Routing summary (all outputs)' })
  definitions.push({ variableId: 'active_scene', name: 'Active scene slot' })
  definitions.push({ variableId: 'model', name: 'Device model' })
  definitions.push({ variableId: 'firmware', name: 'Firmware version' })
  definitions.push({ variableId: 'ip_address', name: 'IP address' })
  definitions.push({ variableId: 'ip_mode', name: 'IP mode (DHCP/Static)' })
  return definitions
}

module.exports = function (self) {
  self.setVariableDefinitions(buildVariableDefinitions())
  self.setVariableValues(buildVariableValues(self.state))
}

module.exports.buildVariableValues = buildVariableValues
module.exports.buildVariableDefinitions = buildVariableDefinitions
