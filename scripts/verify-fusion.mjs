import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const checked = spawnSync(process.execPath, ['scripts/verify-coach-lite.mjs'], { stdio: 'inherit' })
if (checked.status !== 0) process.exit(checked.status ?? 1)
const baseline = JSON.parse(readFileSync('reports/fusion-baseline.json', 'utf8'))
for (const [path, expected] of Object.entries(baseline.files)) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, `Frozen source/output changed: ${path}`)
}
console.log('Fusion baseline verified: original HTMLs, legacy source and extracted FSRS core preserved.')

for (const [path, count] of [['src/data/physiology/physiology.json', 73], ['src/data/policy/policy.json', 40]]) {
  const pack = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(pack.sourceHash, createHash('sha256').update(readFileSync(pack.sourceFile)).digest('hex'))
  assert.equal(pack.points.length, count)
  assert.equal(new Set(pack.points.map(p => p.id)).size, count)
  assert.ok(pack.points.every(p => !p.trainingBlocked))
}
console.log('Three-subject source hashes and current 73/40 general question sets verified.')
