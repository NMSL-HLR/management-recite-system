import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('node', ['scripts/verify-fusion.mjs'])
run('npm', ['test'])
run('npm', ['run', 'build'])
copyFileSync(join(root, 'dist/index.html'), join(root, '346_Fusion_Alpha.html'))
run('node', ['scripts/fusion-file-check.mjs'], { FUSION_HTML: '346_Fusion_Alpha.html' })
run('node', ['scripts/verify-fusion.mjs'])
run('python3', ['-c', `
from pathlib import Path
import zipfile
root=Path('.')
output=root/'346_Fusion_Alpha_Source.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in ['.gitignore','.gitattributes','README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','346_Fusion_Alpha.html','346_Physiology_Import.json','MRC_V3_Alpha_Lite.html','MRC_V2.2.2_沉浸诵读冻结版.html','dist/index.html']:
        archive.write(root/name,name)
    for name in ['src','sources','frozen','scripts','tests','reports','docs']:
        for path in sorted((root/name).rglob('*')):
            if path.is_file(): archive.write(path,path.as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert archive.read('346_Fusion_Alpha.html') == (root/'346_Fusion_Alpha.html').read_bytes()
print(output)
`])
