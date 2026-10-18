# 开发、校验与发布

## 环境

Node.js 22.12+，执行 `npm ci` 安装锁定依赖。完整发布还需要支持本地文件的 Chromium。ZIP 使用锁定的 fflate 由 Node 生成，并逐条解压比对；不再依赖 Python。浏览器放在仓库外，用 `CHROME_PATH` 指定。

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

## 本轮构建与验证补充

- `scripts/single-file.ts` 只支持本项目的单入口内联 JS/CSS；有未嵌入的资源、动态分块或异常引用会使构建失败。已移除 `vite-plugin-singlefile` 及其存在告警的 glob 依赖链，未采用有风险的旧版依赖降级。
- 发布 HTML 注入适配离线内联资源的 CSP，禁用网络连接、表单提交与 base URI；开发服务器不注入此策略。内联脚本需要 `unsafe-inline`，这不是对被恶意改写的整个 HTML 的完整保护。
- `scripts/completion-check.mjs` 覆盖教材修订、多窗口、完整浏览器退出重启、启动脚本故障、拖放、键盘操作和合成大数据。默认完整回归始终包含这些测试。
- 可用 `PERF_BASELINE_HTML=/绝对路径/上版.html FUSION_TRANSPORT=http npm run file-check` 做同机同数据对照。基线应是上一版受信任产物，测试只注入合成记录。未指定基线时仍测当前版，不伪造对照。
- `FUSION_COMPLETION_ONLY=1` 仅供局部排查，报告会写 `scope: completion-only`；不得将其当成完整交付结果。

旧入口 `src/App.tsx`、`src/views/Today.tsx` 不进入当前入口依赖图，暂作兼容参考；`src/views` 其余视图、`src/state/store.tsx`、`src/coach` 仍由融合界面调用。两个状态层分别维护通用和管理学记录，不能整目录删除或合并后绕过受保护引擎。所有派发与跨模块完成仍走原桥接与事务日志。

本轮 `scripts/pdca-check.mjs` 由完整浏览器回归调用，覆盖教材迁移完整保留、真实导出再恢复、非法草稿拒绝、迁移前备份失败以及忘记后的教练等待。Windows 构建脚本使用 npm 的系统命令入口、系统临时目录及 Chrome/Edge 默认路径探测；本环境仅实测 Linux Chromium，不把这些兼容改动写成 Windows 实机通过。

## 离线答题评审

`src/review/` 为纯派生分析，`AnswerReview` 只通过既有核对回调接入两种训练；没有新增学习数据格式。`tests/review.test.ts` 覆盖格式、数字/符号/方向/否定词、来源边界、空值、重复与计算上限。`scripts/review-check.mjs` 接入完整浏览器回归，覆盖手机尺寸、确认取消、持久化、失败路径、报告下载和考试隔离。

调试可用 `FUSION_REVIEW_ONLY=1 FUSION_TRANSPORT=http npm run file-check`，生成的报告明确为 `review-only`。发布命令拒绝这类局部测试变量，必须完成整个套件。评审可用性不等于已测过实际鸿蒙设备：目前实际浏览器为云端 Chromium，手机识字和原生粘贴仍需机型验证。

## 当日科目与自主练习

`src/fusion/planner.ts` 增加当天科目过滤、资料库候选与有限练习范围；`FusionDay.subjects` / `practice` 为可选字段，缺省使用旧行为，沿原整包导出与校验，不改版本号和原学习记录。`store.tsx` 提供显式预览/确认与追加今日预算入口。UI覆盖 Today、Next、两种资料库和统一对话框。

`tests/selection.test.ts` 覆盖科目隔离、旧格式读取、次日重置、有限章节、提前复习、预算上限和整包兼容；`scripts/selection-check.mjs` 覆盖真实浏览器交互与写入故障。调试可用 `FUSION_SELECTION_ONLY=1 FUSION_TRANSPORT=http npm run file-check`；局部报告不算发布验收，完整发布命令拒绝该环境变量。
