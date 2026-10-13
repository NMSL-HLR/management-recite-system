# 开发、校验与发布

## 环境

Node.js 22.12+，执行 `npm ci` 安装锁定依赖。完整发布还需要 Python 3（标准库 zipfile）和支持本地文件的 Chromium。浏览器放在仓库外，用 `CHROME_PATH` 指定。

开发服务：`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm run parse` | 从原稿生成管理学与生理学数据、报告和教材导入包 |
| `npm run parse:physiology` | 仅解析生理学资料 |
| `npm test` | 先解析教材，再运行单元测试 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run build` | 解析、类型检查、生成单文件 `dist/index.html` |
| `npm run verify-content` | 核对管理学原稿、解析数量和来源 hash |
| `npm run verify-fusion` | 核对冻结文件、教材、原 MRC 和 FSRS 核心 |
| `npm run verify-package` | `verify-fusion` 的兼容入口，不负责构建或浏览器测试 |
| `CHROME_PATH=/path/to/chromium npm run file-check` | 对 `dist/index.html` 执行实际离线浏览器回归 |
| `CHROME_PATH=/path/to/chromium npm run package-release` | 完整验证并更新当前 HTML 和源码 ZIP |

`package-fusion` 与 `package-release` 调用同一个发布脚本。依次核对冻结基线、测试、构建、复制当前 HTML、对该 HTML 做离线回归、再次检查基线，最后生成 ZIP。失败立即停止，不生成新的 ZIP；此前可能已更新 HTML 或报告，须完整重跑成功后再交付。

## 产物管理

- 根目录当前 HTML、教材 JSON、源码 ZIP 有意保留，便于直接下载；ZIP 不包含自身、重复的 `dist/index.html`、截图或日志。
- `dist/`、`coverage/`、`*.tsbuildinfo` 不提交。
- 保留文字验收报告、校验 JSON、基线和主要截图。重复的 `fusion-neo.png` 忽略，运行回归仍会生成它。
- 解析更新教材 `builtAt`。保护检查只忽略该生成时间，其他管理学教材内容仍需与基线一致。
- `manual-review/` 是解析器生成并读取的人工审核区，不整体忽略、不自动删除。人工确认后应连同修改保存；发布 ZIP 在目录存在时包含其 JSON。它不是个人学习记录目录。
- `sources/physiology/*.md` 禁止 Git 换行转换，保留原稿的逐字节 hash。
- 不要修改冻结基线绕过失败，不要用融合构建覆盖冻结 HTML。

## 托管环境浏览器

部分系统 Chromium 禁止 `file://`。可在仓库外准备测试浏览器：

```bash
npm install --prefix /tmp/mrc-fusion-browser --no-audit --no-fund @sparticuz/chromium@143.0.4
node -e "require('/tmp/mrc-fusion-browser/node_modules/@sparticuz/chromium').executablePath().then(p=>process.stdout.write(p))"
CHROME_PATH=/tmp/chromium npm run package-release
```

此浏览器用于离线回归，不代表已完成实体设备兼容性验证。
