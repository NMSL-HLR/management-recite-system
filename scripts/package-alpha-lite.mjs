import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('node', ['scripts/verify-coach-lite.mjs'])
run('npm', ['test'])
run('npm', ['run', 'build'])
run('node', ['scripts/verify-coach-lite.mjs'])
// This is the only release HTML written by the Alpha Lite packager.
copyFileSync(join(root, 'dist/index.html'), join(root, 'MRC_V3_Alpha_Lite.html'))
run('node', ['scripts/coach-lite-file-check.mjs'], { MRC_HTML: 'MRC_V3_Alpha_Lite.html' })
run('node', ['scripts/verify-coach-lite.mjs'])
run('python3', ['-c', `
from pathlib import Path
import zipfile
root=Path('.')
output=root/'pku346-recall-v3-alpha-lite-source-and-html.zip'
top=['.gitignore','README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','MRC_V3_Alpha_Lite.html','MRC_V2.2.2_沉浸诵读冻结版.html','dist/index.html']
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in top:
        archive.write(root/name,name)
    for name in ['src','sources','scripts','tests','reports']:
        for path in sorted((root/name).rglob('*')):
            if path.is_file(): archive.write(path,path.as_posix())
print(output)
`])
console.log('Alpha Lite packaged. V2.2.2 frozen HTML was verified and preserved.')

