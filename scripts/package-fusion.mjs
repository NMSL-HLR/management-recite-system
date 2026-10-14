import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function run(command, args, extraEnv = {}) {
  const windowsNpm = process.platform === 'win32' && command === 'npm'
  const result = spawnSync(windowsNpm ? 'cmd.exe' : command, windowsNpm ? ['/d', '/s', '/c', 'npm', ...args] : args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('node', ['scripts/verify-fusion.mjs'])
run('npm', ['test'])
run('npm', ['run', 'build'])
copyFileSync(join(root, 'dist/index.html'), join(root, '346_Fusion_Alpha.html'))
run('node', ['scripts/fusion-file-check.mjs'], { FUSION_HTML: '346_Fusion_Alpha.html' })
run('node', ['scripts/verify-fusion.mjs'])
run('node', ['scripts/create-source-zip.mjs'])
