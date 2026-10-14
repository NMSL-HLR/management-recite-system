# PDCA 修复与发布验收

日期：2026-10-14（UTC）。工作分支：`fix/pdca-release-ready`。底座：`273a4ca`，保留 `main` 与冻结 HTML。对应本次上传成品的[独立复核](upload-review-2026-10-14.md)，以及此前[三方审计闭环清单](audit-closure.md)。附件中的建议经复核后采用，没有把报告中的措辞当作事实或执行指令。

## 整合原则

采用已有政策教材、会话写锁、独立故障恢复、逐题教材修订和零依赖告警的完整底座，选择性整合上传版的有效改动。没有用分叉包整体覆盖。346 主题界面、管理学原学习引擎、生理学与体育概论资料均保留。

## 确认缺陷的闭环

| 编号 | 最终处理 | 验证依据 |
| --- | --- | --- |
| F01 迁移丢完整历史 | 未匹配 Attempt 完整留在原数组，待查只增加索引；失效草稿与考试完整归档；先保存原始快照，失败停止两个模块写入 | 内容恢复单测；浏览器逐字比对原始备份、真实导出并在新上下文恢复、空间不足故障注入 |
| F02 多窗口旧快照覆盖 | 保留底座的排他 Web Lock，第二窗口不挂载写入 Provider | 双窗口竞争与关闭原窗口后接续回归 |
| F03 Provider 异常白屏 | 保留独立 ErrorBoundary、原始备份入口和静态启动兜底 | 持续读取异常、无法读存储、脚本语法错误注入；原始数据保留 |
| F04 失效题卡死 | 将失效 Recall/Exam/任务完整归档，释放未完成任务预算，恢复可训练题；不删正文 | 失效双模块任务恢复、刷新幂等、新题开始、备份恢复 |
| F05 主体全选清空体育点 | 保留集合合并，不清除已选体育和二级要点 | 真实 Recall 核对 UI 回归 |
| F06 非法信心值入库 | 草稿、Attempt、整包和写入边界一致要求 1–5 整数，补足本地提示级别检查 | 0、9、1.5 与非法 hint 单测；文件选择器导入 9/1.5 被拒且无写入 |
| F07 Recall 丢表头 | 保留共用表格组件与真实 thead/th | 教材对照表头逐字浏览器验证 |

同时整合陈旧 Coach 任务退款、恢复真实 Recall 时防止两个进行中任务、按本地日期生成日程种子。Windows 构建使用 Node 压缩器、系统临时目录及 Chrome/Edge 探测；未声称 Windows 实机测试完成。原“chapterKey 可选链必崩溃”的判断不成立，没有据此改教材或学习规则。

遗漏项原截止保留、生理学引用显示、4 道仅供查询题、教材章节配额更新途径，以及此前已修复的计时、输入、焦点、导入事务与界面问题均留在完整回归中。

## PDCA 复查中追加的修复

1. 已完成的管理学 Attempt 可能先保存、平台结算随后失败。现先按原 itemId/startedAt 补结算，再清理失效题，整包恢复也遵守相同顺序；不会给已完成题错误退款。
2. 单模块合并保留本机尚未交卷的考试；导入文件自己的草稿和考试进入待查，避免静默丢失。不同题目共用同一历史 ID 时拒绝合并。
3. “忘记”造成同一通用题立即连续派发：新增教练层 20 分钟等待，期间可练其他题；没有其他题则等待或收工。原 FSRS dueDate、评分、日志和公式完全不变。20 分钟是明确的产品规则，不是经个体实验估计的最佳记忆间隔。
4. 新增迁移前原始快照的独立导出；无快照时显示真实提示，不误报下载成功。
5. 旧搜索回归在 deferred 搜索完成前读取列表，形成偶发误报；测试改为等待可见列表更新后断言，没有用固定休眠放宽产品判定。

## 数据兼容与变更位置

- `src/state/contentRecovery.ts`：无损内容核对、导入外围保护。原 `src/engine/transfer.ts` 保持冻结。
- `src/components/MigrationReview.tsx`：待查原文查看和导出；旧摘要缺正文时明确说明，不能凭空重建已丢历史。
- `src/fusion/planner.ts`、`transfer.ts`、`validateMrc.ts`、`store.tsx`：任务恢复与先结算、导入校验、受保护状态不写入、教练等待。
- `src/coach/recallAdapter.ts`：释放陈旧未完成任务的预留预算。
- `src/state/store.tsx`、`src/browser/recovery.ts`、`index.html`：迁移前快照及失败保护，原始恢复包包含新备份键。
- `src/fusion/views/GeneralTraining.tsx`、`Library.tsx`、`Records.tsx`：统一教练可复测时间；`src/views/Settings.tsx` 展示待查。
- `scripts/create-source-zip.mjs`、`package-fusion.mjs`：Node 打包，ZIP 全条目解压逐字比对。
- 测试与发布文档随代码更新；旧审计报告保留历史事实，本报告补充后续结果。

没有新 migration/envelope 系统。`migrationReview[].recovery` 与 `platform.unavailableTasks` 为可选保全字段，旧数据可缺省；现有 Attempt 结构不变。新快照键为 `pku346-content-before-repair-v1`。正常升级不清空个人记录。

## 最终验证

- 17 个单元测试文件、128 项通过；TypeScript 与生产构建通过。
- 完整浏览器回归 57 场景通过，零非预期脚本错误、零额外外部请求；包含完整浏览器进程关闭再打开。原始结果见 [fusion-file-check.json](fusion-file-check.json)，`scope: full`。
- 依赖全量与运行时审计均为 0 项告警，见 `dependency-audit.json` 与 `dependency-runtime-audit.json`。
- `verify-fusion` 通过：14 个管理学保护文件、原 FSRS 核心、三个冻结 HTML 均不变；教材仅 builtAt 生成时间变化。sourceHash、itemId、schemaVersion=1、contentVersion=2026-10-11-v1 不变，Recall/Evidence/Schedule 原文件未修改。
- 500 题、5000 日志、约 1.8 MB 合成数据，4 倍 CPU 限速输入落盘；同机上版对照原始测量见 `performance-audit.json`。这是边界测量，不是无限历史或实体低端设备认证。
- 完整发布命令在复制后的根目录 HTML 上再次执行完整回归；发布 ZIP 解压后逐条与源码比对。轻量 `346_Fusion_Ready.zip` 只含当前程序、使用说明、验收说明和 HTML SHA-256，避免打开冻结旧版。
- 源码 ZIP 解压到全新目录，重新 npm ci、独立 build 与 verify-fusion 均通过；重新生成的 HTML 除教材 builtAt 时间外与交付版本逐字一致。证据见 [pdca-artifact-check.json](pdca-artifact-check.json)。
- 本轮源码与实际产物都经修复后复审。浏览器验证限制如下，不能将这些结果外推为所有设备、所有输入永远没有问题。

## 实际边界

- 托管 Chromium 的管理策略禁止 `file://`；完整回归通过本地 HTTP 加载同一单文件，程序没有服务器依赖，也没有绕过策略。尚不能代替用户电脑的本地文件实测。
- 没有实测 Windows Edge、Safari、华为设备、读屏与所有极端设备组合。Windows 兼容代码与单文件校验通过不等于这些实机已认证。
- 旧版不会遵守新窗口锁；升级前应先导出全科备份并关闭旧版。不同浏览器/文件来源不会自动同步。
- 老程序已删除且无备份的正文不能恢复。新版本保全此后读到的数据，不伪造历史。
- 本轮结束的是已确认缺陷与分叉整合，不新增旧 V13 的评分撤回、易混对照、任意条目编辑等另一范围的产品能力，也不宣称永远零缺陷。
