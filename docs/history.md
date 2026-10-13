# 历史版本与冻结资产

三个冻结文件保持原路径、原字节，禁止用当前构建覆盖：

- [MRC V2.2.2](../MRC_V2.2.2_沉浸诵读冻结版.html)
- [MRC V3 Alpha Lite](../MRC_V3_Alpha_Lite.html)
- [346 V13 原版](../frozen/346_V13_original.html)

以下链接固定到提交，旧脚本只应在对应版本中使用：

| 版本 | 源码与说明 |
| --- | --- |
| V2.2.2（含更早三个 HTML） | [源码](https://github.com/NMSL-HLR/management-recite-system/tree/d18723f1d09624e925e3dc401c5af5855d8432d6) |
| MRC V3 Alpha Lite | [源码与交付报告](https://github.com/NMSL-HLR/management-recite-system/tree/dd6bcea21630d3a5d182a5ecce944056cd8b0343) |
| 全科融合首版 | [源码](https://github.com/NMSL-HLR/management-recite-system/tree/47b6b804d34efc5dad156ec24f4aa6aebe1cf7a0) |
| 346 界面与审计版 | [源码](https://github.com/NMSL-HLR/management-recite-system/tree/c7c5f9b22525fae434d63ddb4767fbd69fbd01a6) |
| 运动生理学接入版／整理前 | [源码及全部原交付文件](https://github.com/NMSL-HLR/management-recite-system/tree/1b4bc9af969eaa55242c6b70350dc814556bc293) |

保留 `reports/alpha-lite-baseline.json`、`reports/fusion-baseline.json` 和 `scripts/content-baseline.json`：它们是自动冻结检查的输入，不是临时报告。旧交付文件从当前分支移除，Git 历史不改写。
