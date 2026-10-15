---
name: docx
description: 创建、读取、编辑和排版 Word DOCX 文档。用于报告、合同、简历以及现有 Word 文档修改；基于 MIT 开源的 python-docx。
---

# Word 文档

使用 python-docx 读取和编辑 DOCX，不把纯文本改后缀冒充 Word 文件。运行环境需要 Python 3 与 `python-docx==1.2.0`；缺少依赖时说明缺失项，在用户允许安装依赖后用 `python -m pip install python-docx==1.2.0` 安装。首次检查 `python -c "import docx; print(docx.__version__)"`。

技能目录下的 `scripts/document.py` 提供 JSON 输入的创建入口和文本提取：

```
python <技能目录>/scripts/document.py create input.json output.docx
python <技能目录>/scripts/document.py inspect input.docx
```

输入结构：`{"title":"报告标题","paragraphs":["正文"],"tables":[[["名称","数量"],["示例","12"]]]}`。复杂样式、页眉页脚和现有文档修改直接使用 python-docx API；`Document(path)` 加载，修改段落、表格和样式后保存到新路径。保留图片、分节、列表和原有格式，避免重建整份文档导致丢失内容。不把 python-docx 的文本替换声称为原生修订跟踪。

中文文档设置支持中文的字体和合理行距。输出后重新打开，检查段落、表格、节数以及用户要求的实际内容。通过 Mira 文件预览检查分页、表格宽度、图片和标题；仅完成结构校验时如实说明尚未视觉验证。保留用户原文件，交付使用绝对路径 Markdown 文件链接。
