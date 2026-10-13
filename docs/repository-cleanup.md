# 仓库整理记录

基于运动生理学接入版 `1b4bc9a`，在 `chore/repository-cleanup` 分支整理。

## 清理内容

- 移除 V2.1.1、V2.2、V2.2.1 三份已被替代的 HTML 和旧 Alpha Lite 源码 ZIP。
- 移除旧 Alpha Lite 使用说明、交付报告、回归 JSON 及两张截图；固定版本链接归入 [历史档案](history.md)。
- 停止提交重复的 `dist/index.html`，加入构建目录、覆盖率目录和 TypeScript 缓存忽略规则。
- 移除五个旧脚本：V2 打包器及其 Python 压缩器、Alpha Lite 打包器、V2／Alpha Lite 浏览器检查。旧 V2 打包器会写入冻结版文件名，当前不再保留这个误用入口。
- 统一当前发布命令。管理学内容校验脚本改名为 `verify-content.mjs`；`verify-package` 兼容命令现在执行完整冻结基线校验。
- 当前 ZIP 排除重复的 dist、截图和日志，补入存在的人工审核 JSON；检查 ZIP 完整性、当前 HTML 及教材包字节一致性。
- README 改为下载与导航入口，使用、开发、历史说明分开。保留当前桌面、手机及其他主题截图，删除重复的 neo 预览提交。

## 保留资产

三个冻结 HTML、原始教材、来源 hash、itemId、schemaVersion、contentVersion、Recall、Evidence、Schedule、通用 FSRS、用户存储和导入导出实现均未修改。没有删除应用源码或重构 store；源码中旧 MRC 界面仍服务于融合程序，不按文件名判断“无用”。

## 验证

- 98 项单元测试、TypeScript 检查和生产构建通过。
- 当前交付 HTML 的 26 组 file:// 浏览器回归通过，无脚本错误或外部网络请求。
- MRC 14 项保护文件、教材指纹、三个冻结 HTML 和原 FSRS 核心校验通过。
- 源码 ZIP 不包含自身、dist、截图、日志或已删除的旧打包器；包含当前使用／开发文档、原始教材、测试和冻结文件。

具体结果见 [离线回归报告](../reports/fusion-file-check.json)。本次不消除此前记录的开发依赖告警与未覆盖审计项目，也不改写 Git 历史以缩减仓库历史体积。
