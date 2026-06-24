const test = require('node:test')
const assert = require('node:assert/strict')
const { createInitialState } = require('../src/commands')
const { buildVariableValues, buildVariableDefinitions } = require('../src/variables')

function stateWith(overrides) {
  const state = createInitialState()
  return { ...state, ...overrides }
}

test('buildVariableDefinitions declares every Tier 1/2/3 variable id exactly once', () => {
  const ids = buildVariableDefinitions().map((d) => d.variableId)
  assert.equal(new Set(ids).size, ids.length, 'no duplicate variable ids')
  for (const io of [1, 2, 3, 4]) {
    for (const id of [`out${io}_source`, `in${io}_outputs`, `out${io}_mute`, `in${io}_hdcp`, `out${io}_scaler`, `in${io}_edid`]) {
      assert.ok(ids.includes(id), `missing ${id}`)
    }
  }
  for (const id of ['routing_summary', 'active_scene', 'model', 'firmware', 'ip_address', 'ip_mode']) {
    assert.ok(ids.includes(id), `missing ${id}`)
  }
})

test('out*_source reports the feeding input, or "none" when unrouted', () => {
  const state = stateWith({ routing: { 1: 3, 2: null, 3: 3, 4: 4 } })
  const values = buildVariableValues(state)
  assert.equal(values.out1_source, 'IN3')
  assert.equal(values.out2_source, 'none')
  assert.equal(values.out4_source, 'IN4')
})

test('in*_outputs lists the outputs an input feeds, or "-" when none', () => {
  const state = stateWith({ routing: { 1: 3, 2: 1, 3: 3, 4: 4 } })
  const values = buildVariableValues(state)
  assert.equal(values.in3_outputs, '1,3')
  assert.equal(values.in1_outputs, '2')
  assert.equal(values.in2_outputs, '-')
})

test('routing_summary joins every output\'s source with the documented separator', () => {
  const state = stateWith({ routing: { 1: 3, 2: 1, 3: 3, 4: 4 } })
  assert.equal(buildVariableValues(state).routing_summary, 'OUT1←IN3 · OUT2←IN1 · OUT3←IN3 · OUT4←IN4')
})

test('out*_mute reads Muted/Unmuted; null (unpolled) reads as Unmuted', () => {
  const state = stateWith({ audioMute: { 1: true, 2: false, 3: null, 4: null } })
  const values = buildVariableValues(state)
  assert.equal(values.out1_mute, 'Muted')
  assert.equal(values.out2_mute, 'Unmuted')
  assert.equal(values.out3_mute, 'Unmuted')
})

test('in*_hdcp and out*_scaler read On/Off; null (unpolled) reads as Off', () => {
  const state = stateWith({ hdcp: { 1: true, 2: false, 3: null, 4: null }, scaler: { 1: false, 2: true, 3: null, 4: null } })
  const values = buildVariableValues(state)
  assert.equal(values.in1_hdcp, 'On')
  assert.equal(values.in3_hdcp, 'Off')
  assert.equal(values.out2_scaler, 'On')
  assert.equal(values.out3_scaler, 'Off')
})

test('active_scene reports the first slot whose learned routing matches live routing, else "none"', () => {
  const matching = stateWith({
    routing: { 1: 1, 2: 2, 3: 3, 4: 4 },
    scenes: { 1: { 1: 1, 2: 2, 3: 3, 4: 4 }, 2: null, 3: null },
  })
  assert.equal(buildVariableValues(matching).active_scene, '1')

  const none = stateWith({ routing: { 1: 1, 2: 2, 3: 3, 4: 4 }, scenes: { 1: null, 2: null, 3: null } })
  assert.equal(buildVariableValues(none).active_scene, 'none')
})

test('in*_edid maps the preset number to its human label via EDID_CHOICES; null reads as Unknown', () => {
  const state = stateWith({ edid: { 1: 6, 2: 12, 3: null, 4: 1 } })
  const values = buildVariableValues(state)
  assert.equal(values.in1_edid, '4K@60Hz 2.0ch audio With HDR')
  assert.equal(values.in2_edid, 'Smart EDID')
  assert.equal(values.in3_edid, 'Unknown')
  assert.equal(values.in4_edid, 'Copy from Output 1')
})

test('model, firmware, ip_address, ip_mode pass through deviceInfo, defaulting to empty string', () => {
  const empty = buildVariableValues(stateWith({}))
  assert.equal(empty.model, '')
  assert.equal(empty.firmware, '')
  assert.equal(empty.ip_address, '')
  assert.equal(empty.ip_mode, '')

  const filled = buildVariableValues(
    stateWith({ deviceInfo: { model: '4KMX44-H2', firmware: 'VER 3.1 · ARM 2.6', ipAddress: '192.0.2.10', ipMode: 'DHCP' } }),
  )
  assert.equal(filled.model, '4KMX44-H2')
  assert.equal(filled.firmware, 'VER 3.1 · ARM 2.6')
  assert.equal(filled.ip_address, '192.0.2.10')
  assert.equal(filled.ip_mode, 'DHCP')
})
