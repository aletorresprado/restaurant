const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('root JSON configuration is valid UTF-8 without a BOM for CI tools', () => {
  for (const name of ['package.json', 'turbo.json']) {
    const content = readFileSync(path.resolve(__dirname, '..', name), 'utf8');
    assert.notEqual(content.charCodeAt(0), 0xFEFF, `${name}: remove UTF-8 BOM`);
    assert.doesNotThrow(() => JSON.parse(content), `${name}: invalid JSON`);
  }
});
