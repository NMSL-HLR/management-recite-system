import { readFileSync, readdirSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { dirname, join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync, unzipSync } from 'fflate'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = ['.gitignore','.gitattributes','README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','346_Fusion_Alpha.html','346-Fusion-cleaned-2026-10-14.json','346_Physiology_Import.json','346_Sports_Policy_Import.json','MRC_V3_Alpha_Lite.html','MRC_V2.2.2_沉浸诵读冻结版.html']
function walk(path) {
  if (!existsSync(path)) return
  for (const entry of readdirSync(path, {withFileTypes:true})) {
    const full = join(path,entry.name)
    if (entry.isDirectory()) walk(full)
    else if (['.ts','.tsx','.css','.json','.md','.mjs','.py','.html'].includes(extname(entry.name))) files.push(relative(root,full).split(/[/\\]/).join('/'))
  }
}
for (const dir of ['src','sources','frozen','scripts','tests','reports','docs','manual-review']) walk(join(root,dir))
const entries = Object.fromEntries([...new Set(files)].sort().map(name=>[name,new Uint8Array(readFileSync(join(root,name)))]))
assert.ok(!Object.keys(entries).some(name=>name==='dist/index.html'||/\.(zip|png|log)$/.test(name)))
const zip = zipSync(entries,{level:6}), restored = unzipSync(zip)
for (const [name,data] of Object.entries(entries)) assert.deepEqual(restored[name],data,`ZIP mismatch: ${name}`)
const target=join(root,'346_Fusion_Alpha_Source.zip'), temp=`${target}.tmp`
writeFileSync(temp,zip); renameSync(temp,target)
console.log(`Verified ${Object.keys(entries).length} ZIP entries, including UTF-8 paths, source and release HTML.`)

// A small user-facing download avoids confusing the current app with frozen HTMLs in the source ZIP.
const html = readFileSync(join(root, '346_Fusion_Alpha.html'))
const ready = {
  '346_Fusion_Alpha.html': new Uint8Array(html),
  '使用说明.md': new Uint8Array(readFileSync(join(root, 'docs/usage.md'))),
  '发布验收.md': new Uint8Array(readFileSync(join(root, 'reports/policy-six-release.md'))),
  'SHA256.txt': new TextEncoder().encode(`${createHash('sha256').update(html).digest('hex')}  346_Fusion_Alpha.html\n`),
}
const readyZip = zipSync(ready, { level: 6 }), roundtrip = unzipSync(readyZip)
for (const [name, data] of Object.entries(ready)) assert.deepEqual(roundtrip[name], data, `Download ZIP mismatch: ${name}`)
const readyPath = join(root, '346_Fusion_Ready.zip')
writeFileSync(`${readyPath}.tmp`, readyZip); renameSync(`${readyPath}.tmp`, readyPath)
console.log('Verified standalone download ZIP with the current HTML, usage, acceptance report and SHA-256.')
