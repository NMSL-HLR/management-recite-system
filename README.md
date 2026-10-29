# 346 证据教练版（2026-10-29）

当前分支 `feat/evidence-budget-coach`。先确认净学习时间，再按恢复/新学、局部短复习、完整延迟验收推进。旧成绩与草稿保留，局部测试不冒充整题掌握。三科正文155题，另有14组生理补充。

- [每日SOP](docs/daily-study-sop.md)
- [本版改动与兼容说明](reports/study-coach-release.md)
- [实际容量实验](reports/study-capacity.json)
- [本轮浏览器回归](reports/study-browser-check.json)
- 下载 `346_Fusion_Ready.zip` 解压打开HTML；更新前先从旧版导出全科整包。
- `npm ci && npm run build` 重建单文件；`npm test` 重跑单元与容量测试；`npm run package-release` 包含本轮浏览器回归并打包（需Chromium）。历史浏览器脚本保留，但旧版的首次启动/预算/考试预期不适用于当前教练流程。

以下为前版资料替换记录，测试数字属于前版，不作为本版验收结果。

---

# 346 全科备考教练 · 三科资料更新版（2026-10-29）

离线单文件考研训练程序，沿用 346 记忆引擎的三主题界面。管理学使用 MRC 主动提取与证据链，其他科目使用原通用 FSRS 模块。

## 下载使用

**三科资料已按新稿替换。** 生理学73个模块（A类33＋B类26＋Lite14）；管理学56题＋22组附录；体育概论40道优先题。管理学78项经逐题核对正文及核对项一致，沿用原ID、成绩与草稿；另外两科的新题独立建档，旧内置资料转入“旧教材档案”。[本次更新与验收](reports/three-subjects-20261029-release.md)。

**新增当天科目选择与资料库自主练习。** 首页默认自动安排，也可多选今天的科目；资料库可练一节或一道题。共用原训练、评审和记录，预算不足先停止，明确确认后才追加。详见[本版验收说明](reports/subject-practice-release.md)。

**新增免费离线答题评审。** 手机识别手写答案后粘贴，交卷即显示原文对应、相关表述、需要检查和未匹配项。本人确认后继续原训练流程；不调用 API，不上传答案，不生成考试分数。管理学、运动生理学、体育概论及已揭晓的管理学考试均可使用。[功能与验收说明](reports/answer-review-release.md)。

**体育概论使用《40题优先背诵专册》，旧六讲不再作为默认训练资料。** [独立体育概论教材JSON](346_Sports_Policy_Import.json)沿用兼容文件名，内容已是40题新册。

**历史固定基线：2026-10-14 清理版（未含政策热点新资料）。** [下载程序＋零记录备份](346_Clean_Baseline_2026-10-14.zip) · [使用说明](docs/clean-baseline.md)。首次使用需导入随附备份一次，之后正常训练和导出；更换HTML不会自动清理浏览器记录。

| 文件 | 用途 |
| --- | --- |
| [346_Fusion_Ready.zip](346_Fusion_Ready.zip) | **推荐下载**：解压即用，包含当前 HTML、使用说明与验收报告 |
| [346_Fusion_Alpha.html](346_Fusion_Alpha.html) | **当前程序**：下载后用浏览器打开，无需安装或启动服务器 |
| [346_Physiology_Import.json](346_Physiology_Import.json) | 独立运动生理学教材包；当前程序已内置 |
| [346_Fusion_Alpha_Source.zip](346_Fusion_Alpha_Source.zip) | 当前源码、程序、原稿、冻结版本与文字验收报告 |

在 GitHub 文件页点击 **Download raw file** 下载，不要把网页另存为程序。当前发布分支是 `feat/three-subjects-20261029`（三科新稿，保留自主选科与离线评审），`main` 保留 V2.2.2 基线。

新用户内置169道训练题／模块（管理56＋生理73＋概论40），另有22组管理学附录查询。仍按“开始训练 → 保存结果 → 下一项／等待复测／收工”使用。

升级前从旧程序导出全科整包，再在新版「设置数据」恢复；换文件位置或浏览器后，存储不一定互通。详见[使用与备份说明](docs/usage.md)。

## 开发

需要 Node.js 22.12+。

```bash
npm ci
npm run dev
```

```bash
npm test
npm run build
npm run verify-fusion
CHROME_PATH=/path/to/chromium npm run file-check
```

完整发布：`CHROME_PATH=/path/to/chromium npm run package-release`，需要支持 `file://` 的 Chromium；ZIP 由 Node 生成，不需要 Python。`package-fusion` 是相同流程的兼容命令。详见[开发与发布说明](docs/development.md)。

## 目录与版本

| 路径 | 内容 |
| --- | --- |
| `src/fusion/` | 全科界面、任务分配与模块衔接 |
| `src/coach/`、`src/engine/`、`src/views/` | 管理学教练层、学习引擎和训练界面 |
| `src/general/` | 通用科目训练与教材安装 |
| `sources/`、`src/data/` | 原始教材与生成数据 |
| `scripts/`、`tests/` | 解析、校验、打包和测试 |
| `reports/` | 冻结校验基线、验收报告与界面样例 |
| `docs/` | 使用、开发和历史版本说明 |
| `dist/` | 本机构建目录，不提交；正式 HTML 在根目录 |

V2.2.2、MRC Alpha Lite、346 V13 三个冻结 HTML 保留原路径，打包时校验哈希。更早产物及旧打包器从当前分支移除，仍可从[版本档案](docs/history.md)查阅；不改写 Git 历史。

## 验证范围

本轮结果见 [六讲政策替换验收](reports/policy-six-release.md)；自主选择功能见 [自选科目与章节练习验收](reports/subject-practice-release.md)；前版结果见 [离线评审发布验收](reports/answer-review-release.md) 与 [PDCA 发布验收](reports/pdca-release.md)；此前逐项处理结果见[三方审计闭环清单](reports/audit-closure.md)，前一轮记录见[训练体验与异常恢复](reports/audit-training-recovery.md)。托管浏览器禁止 `file://` 时，可显式使用 `FUSION_TRANSPORT=http` 验证同一单文件；报告会注明限制，不代表完成本地文件实机验证。

[用户体验审计与改进](reports/ux-journey-audit.md) · [外部审计复核与修复](reports/external-audit-review.md) · [浏览器回归结果](reports/fusion-file-check.json) · [界面审计](reports/ui-audit.md) · [运动生理学接入](reports/physiology-delivery.md) · [仓库整理记录](docs/repository-cleanup.md)

当前依赖审计为 0 项告警；已加入同源多窗口写入保护、教材逐题修订、完整浏览器进程重启验证和合成大数据测量。实体设备与本地文件协议的验证限制仍保留，详见闭环清单。学习引擎、冻结版本与数据标识保持不变。通用科目“忘记”后由教练等待 20 分钟再派同题，原 FSRS 到期字段保留；详见使用说明。
