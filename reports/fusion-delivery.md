# 346 全科备考教练 · 融合 Alpha 交付说明

## 目标与范围

以现有MRC分支为可构建底座，把v7.3旧记忆引擎的FSRS核心作为通用模块，增加全科任务教练。用户从同一首页进入管理学、生理学、概论训练，完成后得到下一项、等待复测或收工。新分支`feat/346-fusion-alpha`；`main`及原Alpha Lite分支保留。

V13 HTML没有内置生理学/概论教材或个人学习记录，初始points为空。两科内容需要导入旧程序导出的JSON，或在资料库录入。交付不生成教材答案，不将旧管理学自评换算成Evidence。

## 版本来源与保留

- 完整源码文档明确标注v7.3。
- 上传HTML名为V13，内部构建标记仍为`v12-fusion-primary-key-quota-v4-20260820`。
- 原文归档在`sources/legacy/346-v7.3-source.md`与`frozen/346_V13_original.html`。
- 从文档提取`src/general/scheduler.ts`、`types.ts`与`naturalSort.ts`，仅调整相对类型导入。FSRS的21个参数和公式不变；独立适配器按V13保持率配置反解间隔。
- 配额采用新实现：新学数量累计计数、当日章节锁定、总分钟预算。没有照抄旧版滚动队列上限或超期强制突破预算。

`scripts/verify-fusion.mjs`同时验证14项MRC保护文件、原Alpha Lite HTML、V13 HTML、源码文档和提取出的FSRS/types。教材生成数据只允许builtAt变化。

管理学sourceHash、itemId、schemaVersion=1、contentVersion=2026-10-11-v1不变；Recall、Evidence、Schedule、Exam、原JSON导入引擎文件均未修改。

## 文件修改清单

| 文件/目录 | 作用 |
| --- | --- |
| `src/fusion/types.ts` | 平台任务、预算、科目配额、会话和独立platformVersion |
| `src/fusion/planner.ts` | 候选池、章节锁定、累计配额、全科选择、跨日、接续旧Alpha预算与MRC结果 |
| `src/fusion/store.tsx` | 平台状态保存、原AppApi转接、训练恢复、导入预览、整包导出与回滚 |
| `src/fusion/transfer.ts` | 两种旧JSON兼容、整包校验、两份存储写入恢复日志、旧键仅读取 |
| `src/fusion/FusionApp.tsx` | 四个主入口与原管理学页面装配 |
| `src/fusion/views/Today.tsx` | 今日作战台、一个开始按钮、预算和资料导入提示 |
| `src/fusion/views/Next.tsx` | 完成后的全科下一步、等待与收工说明 |
| `src/fusion/views/GeneralTraining.tsx` | 闭卷草稿、冻结、逐点核对和原FSRS评分 |
| `src/fusion/views/Library.tsx` | 通用资料查询/录入，管理学原库入口，旧管理学只读查询 |
| `src/fusion/views/Records.tsx` | 两模块记录入口、真实遗漏和通用闭卷草稿记录 |
| `src/fusion/views/Settings.tsx` | 总预算、科目权重/配额、备份与管理学工具入口 |
| `src/general/data.ts` | 旧数据迁移/保留扩展字段、FSRS适配、日志和遗漏修复 |
| `src/general/scheduler.ts`, `types.ts`, `naturalSort.ts` | 由v7.3文档提取的原核心 |
| `src/state/store.tsx` | 新增模块启动、已写入状态接纳与AppApi覆盖接口，不重写原store |
| `src/components/CoachNext.tsx` | 平台内使用全科下一步，原Alpha组件仍保留 |
| `src/views/Settings.tsx` | 将每日预算说明改为适用于平台与旧版的表述 |
| `src/main.tsx`, `index.html`, `src/styles.css` | 平台装配、导入恢复前置、名称与少量布局样式 |
| `tests/fusion.test.ts` | 全科边界、FSRS兼容、备份恢复测试 |
| `scripts/fusion-file-check.mjs` | 实际file://、三科UI、JSON下载恢复、预算与失败场景 |
| `scripts/verify-fusion.mjs`, `package-fusion.mjs` | 冻结检查、安全打包与ZIP完整性验证 |
| `scripts/package-alpha-lite.mjs` | 融合分支禁止覆盖旧Alpha Lite HTML |
| `package.json`, `README.md`, `docs/` | 融合命令与说明，旧说明归档；依赖与lockfile不变 |
| `src/data/generated/content.json`, `reports/content-parse-report.md`, `dist/index.html` | 正常构建输出，教材仅builtAt变化 |

## 任务与预算规则

1. 未完成任务优先恢复，保存草稿与阶段，刷新不重复收费。
2. 原管理学结果成功保存后，平台引用原Attempt id，不生成第二份Evidence。
3. 到期复习先于新学。管理学候选继续来自原A/B过滤与优先层；通用模块排除旧管理学。
4. 同级候选按“该科已分配分钟/科目权重”选择，平手优先高权重，再按到期时间。默认权重管理学3、生理学2、概论1；这不是硬性分钟份额。
5. 新学任务按当天开始数量累计，不因做完递补而绕过数量上限。章节范围按天锁定，修改配额时显式重选；复习不受新学章节范围限制。
6. 每个任务预计5/10/15分钟，在开始时占用预算。暂停不退还；跨日未完成任务结转到新日并占用预算。管理学已成功保存但平台写入失败时，恢复会先归结原日结果，避免次日错误收费。
7. 总预算是硬边界，过期任务不突破它；余量不足、配额完成或主动收工时停止追加。存在等待复测时显示时间。收工仍有到期题时明确显示积压数量。

## 两种训练结果

管理学：完整保留Attempt、提示序列、冻结草稿、Evidence、体育例证checkpoint与dueAt。

通用模块：原四档FSRS评分与S/D调度；新日志额外保存揭晓前草稿、核对要点、durationSeconds。核对默认不勾选。未核对点记录为遗漏，后续真实核对成功可清除对应遗漏。该自评不等于MRC Evidence，界面不展示预测掌握百分比。

## 数据兼容与安全

MRC键仍为`pku346-recall-v1`；平台新增`346-fusion-platform-v1`。旧`ms346_*_v1`键不改写。

旧记忆引擎JSON按id合并，同id以导入值替换；保留V13扩展字段、来源、易混组等。旧管理学条目及日志保留查询，不重复派发、不按同名标题映射。

MRC JSON调用原inspectImport进行合并与待查处理。旧单模块导入会清空其活动Recall；训练未完成时暂停旧JSON合并，使用完整整包恢复活动训练。

全科整包独立`platformVersion=1`，不提升MRC schema。相同教材版本下恢复两份模块、预算、章节、未完成草稿和原考试状态。两份存储写入前保存备份并写入pending日志；成功写完标为committed。重开时pending回到旧数据对、committed重放新数据对。恢复失败暂停应用写入。已有未知平台版本或坏数据保持原存储，受保护记录可导出原始恢复文件。

不同本地HTML与浏览器不保证共享localStorage，建议显式旧JSON导入和后续整包备份。首次从Alpha Lite同浏览器升级接续已完成的当日任务与预算，避免当天重新无限派题。

## 验收

最终验收：82项单元测试通过，类型检查与生产构建通过；14组实际file://浏览器场景通过，外链请求0、脚本错误0。单元测试、生产构建与实际离线浏览器检查由打包器执行。最终详细结果见`fusion-file-check.json`。浏览器检查包括：

- 新用户A核心题与首页单主按钮。
- 管理学草稿暂停/刷新恢复与单次预算。
- 原independent三天复测与cue_dependent45分钟复测，提示后复述不会洗掉证据。
- 旧JSON预览、取消、合并，旧管理学隔离与扩展字段保留。
- 生理学训练冻结稿、默认空核对、FSRS日志及草稿保存。
- 管理学→生理学→体育概论接续。
- 真正下载整包JSON，另一个浏览器上下文导入并恢复草稿，关闭页面重开继续。
- 15分钟预算收工、未来复测等待、主动收工持久化。
- V2.2.2原记录与未完成Recall读取。
- 模拟存储失败时保留冻结稿、不提交日志。
- 两份模块导入前回滚。
- 375px首屏开始按钮可见，无横向溢出。
- 零外链请求、零页面脚本错误。

## 已知范围

这是融合Alpha，尚未复刻旧V13所有UI：易混对照、评分撤回、手动推迟、已有条目编辑/删除、科目管理和预测图表暂未接入；对应原始字段及旧版HTML保留。日志不自动丢弃，长期大数据备份容量需后续优化。

原管理学闭卷考试保持手动入口与计时，不受全科训练预算限制，也没有扩成全科考试。

未实测Windows Edge与华为浏览器。关闭重开测试是同一浏览器上下文中的新页面，不是完整浏览器进程重启。通过真实JSON下载/不同上下文恢复验证可迁移性。

## 开发环境

已验证npm ci、Vite服务的首页及转换入口、单元测试和单文件构建。file://检查使用HeadlessChrome143。安装脚本与启动指引已保存为云环境配置草稿；保存不等于发布，复用时需在环境设置审核、保存并发布。配置未更改网络规则或凭据。
