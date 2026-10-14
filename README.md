# 346 全科备考教练 · 融合 Alpha

离线单文件考研训练程序，沿用 346 记忆引擎的三主题界面。管理学使用 MRC 主动提取与证据链，其他科目使用原通用 FSRS 模块。

## 下载使用

**当前程序已内置体育概论《政策热点班》五讲：15道训练作业＋5组补漏查询。** 下载下表的当前 HTML；也可用 [独立教材 JSON](346_Sports_Policy_Import.json) 追加导入。详见[接入说明](reports/policy-delivery.md)。

**历史固定基线：2026-10-14 清理版（未含政策热点新资料）。** [下载程序＋零记录备份](346_Clean_Baseline_2026-10-14.zip) · [使用说明](docs/clean-baseline.md)。首次使用需导入随附备份一次，之后正常训练和导出；更换HTML不会自动清理浏览器记录。

| 文件 | 用途 |
| --- | --- |
| [346_Fusion_Alpha.html](346_Fusion_Alpha.html) | **当前程序**：下载后用浏览器打开，无需安装或启动服务器 |
| [346_Physiology_Import.json](346_Physiology_Import.json) | 独立运动生理学教材包；当前程序已内置 |
| [346_Fusion_Alpha_Source.zip](346_Fusion_Alpha_Source.zip) | 当前源码、程序、原稿、冻结版本与文字验收报告 |

在 GitHub 文件页点击 **Download raw file** 下载，不要把网页另存为程序。当前审计修复分支是 `fix/audit-training-recovery`（基于 `feat/sports-policy-textbook`），`main` 保留 V2.2.2 基线。

管理学 A/B 已内置；运动生理学共8章60题，其中56题参与训练、4题原文待补充仅供查询。体育概论已内置政策热点五讲，其他资料可继续导入或录入。首页安排“开始训练 → 保存结果 → 下一项／等待复测／收工”。

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

完整发布：`CHROME_PATH=/path/to/chromium npm run package-release`，需要 Python 3 和支持 `file://` 的 Chromium。`package-fusion` 是相同流程的兼容命令。详见[开发与发布说明](docs/development.md)。

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

本轮修复与验证范围见[训练体验与异常恢复](reports/audit-training-recovery.md)。托管浏览器禁止 `file://` 时，可显式使用 `FUSION_TRANSPORT=http` 验证同一单文件；报告会注明限制，不代表完成本地文件实机验证。

[用户体验审计与改进](reports/ux-journey-audit.md) · [外部审计复核与修复](reports/external-audit-review.md) · [浏览器回归结果](reports/fusion-file-check.json) · [界面审计](reports/ui-audit.md) · [运动生理学接入](reports/physiology-delivery.md) · [仓库整理记录](docs/repository-cleanup.md)

既有3项开发依赖告警仍在；多窗口并发写入、大规模长期数据及实体设备验证仍有未覆盖部分，详见审计报告。整理不改变学习算法，也不代表这些限制已解决。
