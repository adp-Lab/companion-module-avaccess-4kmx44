const test = require('node:test')
const assert = require('node:assert/strict')
const { buildFeedbackDefinitions } = require('../src/feedbacks')

function fakeSelf(state) {
  return { state }
}

test('buildFeedbackDefinitions defines routing_active as a boolean feedback defaulting to RED', () => {
  const fb = buildFeedbackDefinitions(fakeSelf({ routing: {} })).routing_active
  assert.equal(fb.type, 'boolean')
  // André's hard requirement: active = RED, not Companion's default green.
  assert.equal(fb.defaultStyle.bgcolor, 0xff0000)
  assert.deepEqual(
    fb.options.map((o) => o.id).sort(),
    ['input', 'output'],
  )
})

test('routing_active is true only when the given input feeds the given output', () => {
  const fb = buildFeedbackDefinitions(fakeSelf({ routing: { 1: 3, 2: null, 3: null, 4: null } })).routing_active
  assert.equal(fb.callback({ options: { input: 3, output: 1 } }), true)
  assert.equal(fb.callback({ options: { input: 2, output: 1 } }), false)
  assert.equal(fb.callback({ options: { input: 1, output: 2 } }), false)
})

test('output_muted, input_hdcp_on and output_scaler_on reflect state and default to RED', () => {
  const defs = buildFeedbackDefinitions(
    fakeSelf({
      audioMute: { 1: true, 2: false, 3: null, 4: null },
      hdcp: { 1: false, 2: true, 3: null, 4: null },
      scaler: { 1: true, 2: null, 3: null, 4: null },
    }),
  )
  assert.equal(defs.output_muted.defaultStyle.bgcolor, 0xff0000)
  assert.equal(defs.input_hdcp_on.defaultStyle.bgcolor, 0xff0000)
  assert.equal(defs.output_scaler_on.defaultStyle.bgcolor, 0xff0000)
  assert.equal(defs.output_muted.callback({ options: { output: 1 } }), true)
  assert.equal(defs.output_muted.callback({ options: { output: 2 } }), false)
  assert.equal(defs.output_muted.callback({ options: { output: 3 } }), false) // null → false
  assert.equal(defs.input_hdcp_on.callback({ options: { input: 2 } }), true)
  assert.equal(defs.output_scaler_on.callback({ options: { output: 1 } }), true)
})

test('scene_active is red only when a learned scene snapshot equals live routing', () => {
  const self = fakeSelf({
    routing: { 1: 1, 2: 2, 3: 3, 4: 4 },
    scenes: { 1: { 1: 1, 2: 2, 3: 3, 4: 4 }, 2: { 1: 4, 2: 3, 3: 2, 4: 1 }, 3: null },
  })
  const defs = buildFeedbackDefinitions(self)
  assert.equal(defs.scene_active.defaultStyle.bgcolor, 0xff0000)
  assert.equal(defs.scene_active.callback({ options: { slot: 1 } }), true) // matches
  assert.equal(defs.scene_active.callback({ options: { slot: 2 } }), false) // differs
  assert.equal(defs.scene_active.callback({ options: { slot: 3 } }), false) // not learned yet
})

test('all_outputs_muted is true only when every output is muted', () => {
  const allMuted = buildFeedbackDefinitions(fakeSelf({ audioMute: { 1: true, 2: true, 3: true, 4: true } }))
  assert.equal(allMuted.all_outputs_muted.defaultStyle.bgcolor, 0xff0000)
  assert.equal(allMuted.all_outputs_muted.callback({ options: {} }), true)

  const partial = buildFeedbackDefinitions(fakeSelf({ audioMute: { 1: true, 2: false, 3: true, 4: true } }))
  assert.equal(partial.all_outputs_muted.callback({ options: {} }), false)
})
