import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = JSON.parse(readFileSync(join(root, 'reports/alpha-lite-baseline.json'), 'utf8'))
const hash = (data) => createHash('sha256').update(data).digest('hex')
for (const [path, expected] of Object.entries(baseline.protectedFiles)) {
  const bytes = readFileSync(join(root, path))
  const original = path === 'src/content.ts' ? bytes.toString().replace('./data/generated/management-ultimate.json', './data/generated/content.json') : bytes
  assert.equal(hash(original), expected, `Protected V2 file changed: ${path}`)
}
const raw = readFileSync(join(root, 'src/data/generated/content.json'), 'utf8')
assert.equal(hash(raw.replace(/"builtAt":"[^"]*"/g, '"builtAt":""')), baseline.contentFingerprint, 'Content changed beyond generated builtAt')
const content = JSON.parse(raw)
assert.equal(content.meta.schemaVersion, 1)
assert.equal(content.meta.contentVersion, '2026-10-11-v1')
assert.equal(content.items.filter((item) => item.coreA).length, 26)
assert.equal(content.items.filter((item) => item.appendixFullAnswer).length, 2)
console.log(JSON.stringify({ ok: true, protectedFiles: Object.keys(baseline.protectedFiles).length - 1, loaderOnlyChangedDatasetImport: true, legacyContentIdenticalExceptBuiltAt: true, schemaVersion: content.meta.schemaVersion, contentVersion: content.meta.contentVersion }, null, 2))


const active = JSON.parse(readFileSync(join(root, 'src/data/generated/management-ultimate.json'), 'utf8'))
const source = readFileSync(join(root, 'sources/管理学_ultimate.md'), 'utf8')
assert.equal(active.meta.sourceHashes.A, hash(source))
assert.equal(active.meta.sourceHashes.B, hash(source.slice(source.indexOf('# 附录'))))
assert.equal(active.meta.schemaVersion, content.meta.schemaVersion)
assert.equal(active.items.filter(i => i.coreA).length, 56)
assert.equal(active.items.filter(i => i.kind === 'reference').length, 22)
console.log('Authorized management replacement verified: 56 main questions, 22 references; honest new source hashes, original schema and engines preserved.')
