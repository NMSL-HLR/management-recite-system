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

部分托管浏览器的管理策略禁止 `file://`。不要修改或绕过该策略。可以用受支持的 HTTP 地址验证同一个单文件产物：

```bash
FUSION_TRANSPORT=http CHROME_PATH=/usr/bin/chromium npm run file-check
FUSION_TRANSPORT=http CHROME_PATH=/usr/bin/chromium npm run package-release
```

测试器会临时启动仅监听 `127.0.0.1` 的静态服务，只提供目标 HTML；结束后关闭。程序没有新增服务器依赖。报告明确记录 `transport: http`，排除测试页面导航和浏览器 favicon 后，仍要求零额外运行时网络请求。

HTTP 验证不等于 `file://` 验证。使用这一模式生成的产物必须附带该限制，之后在允许本地文件的目标浏览器中补测。默认命令仍使用 `file://`，不会静默降级。

本轮新增的 `scripts/audit-file-check.mjs` 被主回归脚本调用，覆盖真实下载、任务冲突、计时写入隔离、资料查询和故障注入。故障注入仅存在于测试脚本，产品没有测试后门。
