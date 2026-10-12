import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = JSON.parse(readFileSync(join(root, 'reports/alpha-lite-baseline.json'), 'utf8'))
const hash = (data) => createHash('sha256').update(data).digest('hex')
for (const [path, expected] of Object.entries(baseline.protectedFiles)) {
  assert.equal(hash(readFileSync(join(root, path))), expected, `Protected V2 file changed: ${path}`)
}
const raw = readFileSync(join(root, 'src/data/generated/content.json'), 'utf8')
assert.equal(hash(raw.replace(/"builtAt":"[^"]*"/g, '"builtAt":""')), baseline.contentFingerprint, 'Content changed beyond generated builtAt')
const content = JSON.parse(raw)
assert.equal(content.meta.schemaVersion, 1)
assert.equal(content.meta.contentVersion, '2026-10-11-v1')
assert.equal(content.items.filter((item) => item.coreA).length, 26)
assert.equal(content.items.filter((item) => item.appendixFullAnswer).length, 2)
console.log(JSON.stringify({ ok: true, protectedFiles: Object.keys(baseline.protectedFiles).length, contentIdenticalExceptBuiltAt: true, schemaVersion: content.meta.schemaVersion, contentVersion: content.meta.contentVersion }, null, 2))

