const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../companion/manifest.json')

test('manifest.json has every field required by the Companion module schema', () => {
  const requiredFields = [
    'id', 'name', 'shortname', 'description', 'manufacturer',
    'products', 'keywords', 'version', 'license', 'repository',
    'bugs', 'maintainers',
  ]
  for (const field of requiredFields) {
    assert.ok(field in manifest, `manifest.json is missing required field "${field}"`)
  }
  assert.equal(manifest.id, 'avaccess-4kmx44')
  assert.equal(manifest.runtime.type, 'node22')
  assert.equal(manifest.runtime.api, 'nodejs-ipc')
})
