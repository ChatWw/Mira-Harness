---
name: pptx
description: 创建、读取和编辑 PowerPoint PPTX 演示文稿，基于 MIT 开源的 python-pptx。用于幻灯片、汇报、路演材料和现有演示稿修改。
---

# 演示文稿

使用 python-pptx 创建真实 PPTX 文件。需要 Python 3 与 `python-pptx==1.0.2`；先检查 `python -c "import pptx; print(pptx.__version__)"`，缺少依赖时说明并在用户允许后安装。

```
python <技能目录>/scripts/presentation.py create outline.json output.pptx
python <技能目录>/scripts/presentation.py inspect input.pptx
```

提纲结构：`{"slides":[{"title":"标题","body":["要点一","要点二"]}]}`。此入口生成可编辑的基本演示稿。正式交付应根据内容使用 python-pptx 的文本、图片、形状、图表与布局 API 丰富呈现；不把简单提纲输出称为完成视觉设计。

先确定受众、内容结构和页面比例。每页围绕一个清晰结论，保持字号层级、对齐、边距与主题一致，中文使用本机可用字体。编辑现有文件时保留原有母版、对象和用户内容，另存新文件。

保存后重新打开检查页数与文字，并使用 Mira 演示文稿预览逐页检查溢出、重叠、截断、图片比例和图表标签。需要 PDF 导出时先检查 LibreOffice 等转换工具是否存在；python-pptx 本身不负责渲染或导出 PDF。通过绝对路径 Markdown 链接交付，并说明未验证的部分。
