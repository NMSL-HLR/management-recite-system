# MRC V3 Alpha Lite 交付报告

## 交付范围

自动选题 → 调用现有 Recall → 原引擎产生 Attempt → 保存 → 推荐下一步／等待／收工。

开发分支：`feat/v3-coach-alpha-lite`。V2.2.2 基线提交：`d18723f`。

## 修改文件

| 文件 | 用途 |
| --- | --- |
| `src/views/Today.tsx` | 今日作战台、唯一主要行动、预算和等待／收工状态 |
| `src/state/store.tsx` | 最小 Coach 扩展、原存储自动保存、调用适配器、提交成功后进入结果 |
| `src/views/Recall.tsx` | 暂停返回、结果后的 Coach 行动与原 dueAt 展示；提取步骤保留 |
| `src/nav.ts`、`src/App.tsx` | 四个一级入口、训练导航状态；首页收起阅读浮动栏 |
| `src/views/Settings.tsx` | 保留原版方法、错漏、考试入口，说明预算位置 |
| `src/styles.css` | 作战台和下一步的响应式样式 |
| `tests/nav.test.ts` | 四入口导航断言 |
| `package.json` | 独立离线测试和安全的 Alpha Lite 发布入口 |
| `README.md` | 打开方式、范围、预算、备份与恢复说明 |

解析脚本正常更新 `src/data/generated/content.json` 与 `reports/content-parse-report.md` 的生成时间；教材内容、条目身份和关系无变化。

## 新增文件和 Coach 模块

| 文件 | 职责 |
| --- | --- |
| `src/coach/types.ts` | CoachTask、最小 CoachState、输入、候选与决策类型 |
| `src/coach/candidates.ts` | 最新记录、资格过滤、真实 dueAt 和事实理由 |
| `src/coach/selector.ts` | 复用原排序，在剩余预算内选一题 |
| `src/coach/planner.ts` | 日期、有限预算、开始预留、任务完成、跨日恢复 |
| `src/coach/decision.ts` | 未完成优先，然后下一题／等待／收工 |
| `src/coach/recallAdapter.ts` | 调用原 startRecall 和 commitAttempt，不复制学习算法 |
| `src/components/CoachNext.tsx` | 训练结束后的三个出口 |
| `tests/coach.test.ts` | 12 个候选、引擎兼容、预算、恢复及边界用例 |
| `scripts/coach-lite-file-check.mjs` | file:// 下六个必测场景、JSON 回滚、原版考试及移动端 |
| `scripts/verify-coach-lite.mjs` | 冻结文件哈希与教材完整一致性校验 |
| `scripts/package-alpha-lite.mjs` | 测试、构建、交付 HTML 检查、独立源码 ZIP |
| `reports/alpha-lite-baseline.json` | V2 冻结校验值 |
| `.gitignore` | 排除本地依赖与日志 |

## 数据结构

`CoachTask` 严格保持小型结构：`id`、`itemId`、`kind`、`status`、`reason`、`estimatedMinutes`、`createdAt`、`completedAt`。

- kind：`initial_recall` 或 `due_review`。前者在无历史时也用于其他符合资格的首次训练，不意味着所有任务均来自 A 册。
- status：`queued`、`in_progress`、`completed`。
- 预览任务不写入学习证据；开始后才记录活动任务。

`CoachState` 只有 `date`、`budgetMinutes`、`reservedMinutes`、`tasks`、`closed`。它作为原存储对象的可选字段保存；没有 V3 envelope，没有新 migration 或 storage 系统。`src/types.ts` 和原 `Attempt` 结构保持不动。

预算默认 60 分钟：A 完整题 15 分钟、B 项 10 分钟、红线 5 分钟。每开始一项一次性占用预估预算；继续未完成题不会再次扣除。预算耗尽不追加任务。用户可主动提高预算，但系统不会自动提高。

同一浏览器和文件位置的重新打开可恢复任务。跨日保留未完成 Recall，按新日安排重新预留当前任务。旧 JSON 导入流程保持原来的预览、确认、合并、备份、回滚；不增加跨文件教练进度迁移承诺。

## 验证结果

- 原有测试：39 项通过。
- 新增 Coach 测试：12 项通过，总计 51 项。
- TypeScript 和 Vite 单文件构建通过。
- file:// 浏览器验证：HeadlessChrome 153.0.8010.0。
- 新用户推荐第一道 A 核心题；首屏一个主按钮。
- V2 未完成草稿优先恢复，不被其他题覆盖。
- 完成训练产生原格式 Attempt；独立提取保持原 3 天规则，提示依赖保持原 45 分钟规则。
- 15 分钟预算完成后收工，刷新不自动追加。
- 刷新及关闭页面后重新打开，恢复草稿、任务身份和预算。
- V2 历史 Attempt、dueAt、schemaVersion、contentVersion、sourceHashes 保持原值。
- 等待复测、主动收工、JSON 预览／确认导入／回滚、原版限时考试入口通过。
- 375px 页面没有横向滚动；外部请求为 0；页面脚本错误为 0。

详细运行结果：`reports/alpha-lite-file-check.json`。界面截图：`reports/alpha-lite-today.png`、`reports/alpha-lite-mobile.png`。

预装托管 Chromium 禁止打开 file://；本次使用临时安装的独立 headless 测试浏览器完成验证，没有更改托管浏览器策略。Windows Edge 尚未实机验证。

## 冻结保护

`scripts/verify-coach-lite.mjs` 验证 14 个受保护文件逐字节不变，包括 V2.2.2 HTML、两册源文、原类型、Recall、Evidence、Schedule、Priority、Exam、Transfer、Storage、旧日计划和默认设置。

完整教材 JSON 在忽略自动生成的 builtAt 后与冻结基线一致。因此：

- sourceHash 未变。
- itemId 未变。
- schemaVersion 与 contentVersion 未变。
- Recall 提示链未变。
- Evidence 判定未变。
- Schedule 规则未变。
- A/B 关系、体育 checkpoint、闭卷计时、JSON 引擎未变。

## 产物

- `MRC_V3_Alpha_Lite.html`
- `pku346-recall-v3-alpha-lite-source-and-html.zip`
- 原 `MRC_V2.2.2_沉浸诵读冻结版.html` 保留。

本次没有 Exam 重构、新统计页面、AI 评分、自动答案、体育训练模块或完整 V3 persistence。
