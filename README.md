# 346 全科备考教练 · 融合 Alpha

打开 `346_Fusion_Alpha.html` 即可离线使用。本次界面与审计分支：`feat/346-ui-audit`；上一版保留在 `feat/346-fusion-alpha`。管理学调用 MRC；体育概论、运动生理学和其他旧知识条目调用通用 FSRS 模块。

## 界面与审计更新

沿用旧 346 记忆引擎的浅绿背景、描边卡片与硬阴影，恢复「灵像素／通透风／像素风」三主题。桌面侧栏、手机底部导航；右上角或侧栏底部可切换主题。管理学阅读字号、暗色与专注模式继续可用。

本次修复导入字段校验、设置丢失、跨归档重复日志、恢复中断与考试作答冻结等问题。详见[审计报告](reports/ui-audit.md)及[离线回归结果](reports/fusion-file-check.json)。

## 首次使用

1. 管理学 A/B 教材已内置，首页会给出第一项训练。
2. 在旧「346记忆引擎」导出 JSON，再到本版「设置数据」选择备份、查看预览、确认导入。原 HTML 没有内置你的浏览器学习资料，其他科目初始为空，也可以在资料库录入教材条目。
3. 若有 MRC 备份，可在同一入口导入。旧管理学条目保留查询，不自动转换成 MRC 成绩或重复派题。
4. 后续使用「导出全科整包」。整包包含两个模块、今日预算和未完成草稿；换浏览器或文件位置时通过整包恢复。

## 每日训练

首页只有一个开始按钮。先恢复未完成训练，再在总时间预算内安排到期复习和新学；完成后推荐下一项、等待复测或收工。每天默认60分钟；新学数量与章节配额可按科目调整。0新学表示暂停新增，0章节表示不限制章节。

预算按任务预计时长在开始时累计占用；暂停不退还预算，刷新不重复收费，跨日未完成任务占用新一天的预算。它不是精确计时。科目权重用于同级任务的时间分配，不是必须完成的硬性科目分钟数。到期任务不受新学章节上限影响，也不会绕过总预算。

管理学保留原提示链、Evidence、体育例证checkpoint和复测规则。通用模块保留v7.3 FSRS-6核心，并兼容V13保持率设置；先闭卷写出，再冻结草稿、核对要点和自评。通用评分与管理学Evidence分开保存。补漏记录可在后续核对成功时修复。

设置中保留管理学原版闭卷考试、方法说明及详细设置。闭卷考试是手动工具，首版不纳入全科时间预算，也不扩展成全科考试。

## 数据与回退

- 平台使用新增键 `346-fusion-platform-v1`，MRC继续使用 `pku346-recall-v1`；旧 `ms346_*_v1` 键仅读取，不改名或覆盖。
- 同浏览器能访问旧存储时可自动读取；跨本地文件共享存储依浏览器而异，推荐显式JSON导入。
- 旧JSON导入为按id合并，同id以导入值替换，预览后确认；无标题模糊匹配。训练未完成时暂停旧JSON合并，整包可以恢复未完成状态。
- 整包恢复替换两份模块数据，导入前保存两份原始备份；使用恢复日志处理两份存储之间的中断。
- 原MRC单模块导入继续调用原导入引擎，会清空该模块活动Recall；恢复草稿请用全科整包。
- V13条目的额外字段（来源、易混组、章节等）保留在数据中；融合Alpha暂未恢复旧版易混对照、评分撤回、手动推迟、编辑/删除和预测图表界面。旧版原HTML仍可使用。
- 冻结产物：`MRC_V2.2.2_沉浸诵读冻结版.html`、`MRC_V3_Alpha_Lite.html`、`frozen/346_V13_original.html`。首次从Alpha Lite升级会接续当日预算与完成任务。

## 开发与验收

需要 Node.js 22.12+（本次使用 24.19）。

```bash
npm ci
npm test
npm run build
CHROME_PATH=/path/to/chromium npm run file-check
CHROME_PATH=/path/to/chromium npm run package-fusion
```

`package-release`指向融合打包器；输出`346_Fusion_Alpha.html`和`346_Fusion_Alpha_Source.zip`。旧Alpha Lite打包入口在本分支会拒绝覆盖冻结产物。

开发服务：`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`。使用支持file://的Chromium进行单文件检查；部分托管系统Chromium禁止本地文件。测试浏览器可独立安装在仓库外：

```bash
npm install --prefix /tmp/mrc-fusion-browser --no-audit --no-fund @sparticuz/chromium@143.0.4
node -e "require('/tmp/mrc-fusion-browser/node_modules/@sparticuz/chromium').executablePath().then(p=>process.stdout.write(p))"
CHROME_PATH=/tmp/chromium npm run file-check
```

[融合交付报告](reports/fusion-delivery.md)记录接口、版本差异、验收范围与限制。[旧MRC说明](docs/MRC-Alpha-Lite-README.md)是历史文档，其中打包命令仅适用于旧分支。
