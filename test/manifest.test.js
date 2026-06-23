const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../companion/manifest.json')

test('manifest.json has every field required by the Companion module schema', () => {
  const requiredFields = [
    'type', 'id', 'name', 'shortname', 'description', 'manufacturer',
    'products', 'keywords', 'version', 'license', 'repository',
    'bugs', 'maintainers', 'legacyIds', 'runtime',
  ]
  for (const field of requiredFields) {
    assert.ok(field in manifest, `manifest.json is missing required field "${field}"`)
  }
  // v2 (@companion-module/base >=2.0): top-level "type" must be "connection"
  // (required by the SDK manifest schema; its absence blocks module loading).
  assert.equal(manifest.type, 'connection')
  assert.equal(manifest.id, 'avaccess-4kmx44')
  assert.equal(manifest.runtime.type, 'node22')
  assert.equal(manifest.runtime.api, 'nodejs-ipc')
  assert.equal(manifest.runtime.entrypoint, '../src/main.js')
})
