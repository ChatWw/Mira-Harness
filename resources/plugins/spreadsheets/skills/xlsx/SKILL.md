---
name: xlsx
description: 创建、读取、修改和分析 Excel XLSX 电子表格，包含公式与图表。使用 BSD-2-Clause 的 XlsxWriter 和 MIT 的 openpyxl。
---

# 电子表格

新建文件使用 `XlsxWriter==3.2.9`；读取或编辑现有文件使用 `openpyxl==3.1.5`。先检查依赖，缺失时说明并在用户允许后通过 Python pip 安装。保留原文件，写入新路径。

```
python <技能目录>/scripts/workbook.py create input.json output.xlsx
python <技能目录>/scripts/workbook.py inspect input.xlsx
```

输入结构：`{"sheets":[{"name":"销售","rows":[["数量","单价","金额"],[2,10,{"formula":"=A2*B2","value":20}]]}]}`。公式必须显式写成 `{"formula":"=A2*B2","value":20}`；其他字符串按文本写入，避免把用户数据误当作公式。基本入口支持多表、表头样式、冻结表头和列宽。复杂公式、图表、数据校验直接使用上游 API。

公式使用单元格引用，不把计算结果硬编码成公式替代。XlsxWriter 与 openpyxl 都不是公式计算引擎；新建公式可提供经验证的缓存值，或用可用的 Excel／LibreOffice 重算，不能声称保存文件就已验证公式结果。读取文件时分别加载公式视图与缓存值视图，检查错误值、公式引用、工作表名称和预期数值。

通过 Mira 表格预览检查列宽、数字格式、图表和可读性。编辑已有工作簿时注意 openpyxl 对复杂绘图、宏等对象的保留限制，不静默降级。交付绝对路径 Markdown 链接并说明计算与视觉验证范围。
