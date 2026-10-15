"""Mira adapter for python-docx (MIT)."""
import json
import sys
from pathlib import Path
from docx import Document


def main():
    action, source = sys.argv[1:3]
    if action == "inspect":
        document = Document(source)
        print(json.dumps({"paragraphs": [p.text for p in document.paragraphs], "tables": [[[cell.text for cell in row.cells] for row in table.rows] for table in document.tables]}, ensure_ascii=False))
    elif action == "create":
        target = Path(sys.argv[3])
        if target.exists():
            raise FileExistsError(f"Refusing to overwrite {target}")
        data = json.loads(Path(source).read_text(encoding="utf-8-sig"))
        document = Document()
        if data.get("title"):
            document.add_heading(data["title"], 0)
        for text in data.get("paragraphs", []):
            document.add_paragraph(text)
        for rows in data.get("tables", []):
            if not rows:
                continue
            table = document.add_table(rows=0, cols=max(len(row) for row in rows))
            table.style = "Table Grid"
            for row in rows:
                cells = table.add_row().cells
                for index, value in enumerate(row):
                    cells[index].text = str(value)
        target.parent.mkdir(parents=True, exist_ok=True)
        document.save(target)
        print(str(target.resolve()))
    else:
        raise ValueError("Expected create or inspect")


if __name__ == "__main__":
    main()
