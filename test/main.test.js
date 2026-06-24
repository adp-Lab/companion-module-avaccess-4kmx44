const test = require('node:test')
const assert = require('node:assert/strict')
const { InstanceBase } = require('@companion-module/base')
const ModuleInstance = require('../src/main')

test('main.js exports a ModuleInstance class extending InstanceBase with the required lifecycle methods', () => {
  assert.equal(typeof ModuleInstance, 'function')
  assert.ok(ModuleInstance.prototype instanceof InstanceBase)
  for (const method of ['init', 'destroy', 'configUpdated', 'getConfigFields', 'sendCommand', 'startPolling', 'stopPolling', 'maybeLearnScene']) {
    assert.equal(typeof ModuleInstance.prototype[method], 'function', `missing method: ${method}`)
  }
})

test('maybeLearnScene captures routing into the pending slot only on a routing change', () => {
  const inst = Object.create(ModuleInstance.prototype)
  inst.state = { routing: { 1: 1, 2: 2, 3: 3, 4: 4 }, scenes: { 1: null, 2: null, 3: null } }
  inst.pendingSceneLearn = 1

  inst.maybeLearnScene(false) // non-routing poll → nothing learned
  assert.equal(inst.state.scenes[1], null)
  assert.equal(inst.pendingSceneLearn, 1)

  inst.maybeLearnScene(true) // routing poll → learn + clear
  assert.deepEqual(inst.state.scenes[1], { 1: 1, 2: 2, 3: 3, 4: 4 })
  assert.equal(inst.pendingSceneLearn, null)
})

test('startPolling sends one poll command per tick, round-robin; stopPolling halts it', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const sent = []
  const inst = Object.create(ModuleInstance.prototype)
  inst.sendCommand = (c) => sent.push(c)

  inst.startPolling()
  // Primes only the FIRST command synchronously — the matrix drops back-to-back queries.
  assert.deepEqual(sent, ['GET MP all\r\n'])

  // Advance enough ticks for two full cycles of the 5 poll commands.
  t.mock.timers.tick(10 * 300)
  assert.deepEqual(sent.slice(0, 10), [
    'GET MP all\r\n',
    'GET MUTE all\r\n',
    'GET HDCP_S all\r\n',
    'GET SCALER all\r\n',
    'GET EDID all\r\n',
    'GET MP all\r\n',
    'GET MUTE all\r\n',
    'GET HDCP_S all\r\n',
    'GET SCALER all\r\n',
    'GET EDID all\r\n',
  ])

  inst.stopPolling()
  const countAfterStop = sent.length
  t.mock.timers.tick(10 * 300)
  assert.equal(sent.length, countAfterStop, 'no commands sent after stopPolling')
})
