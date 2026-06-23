const test = require('node:test')
const assert = require('node:assert/strict')
const { InstanceBase } = require('@companion-module/base')
const ModuleInstance = require('../src/main')

test('main.js exports a ModuleInstance class extending InstanceBase with the required lifecycle methods', () => {
  assert.equal(typeof ModuleInstance, 'function')
  assert.ok(ModuleInstance.prototype instanceof InstanceBase)
  for (const method of ['init', 'destroy', 'configUpdated', 'getConfigFields', 'sendCommand']) {
    assert.equal(typeof ModuleInstance.prototype[method], 'function', `missing method: ${method}`)
  }
})
