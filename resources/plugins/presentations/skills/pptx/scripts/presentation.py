"""Mira adapter for python-pptx (MIT)."""
import json
import sys
from pathlib import Path
from pptx import Presentation


def main():
    action, source = sys.argv[1:3]
    if action == "inspect":
        deck = Presentation(source)
        print(json.dumps({"slides": [[shape.text for shape in slide.shapes if shape.has_text_frame] for slide in deck.slides]}, ensure_ascii=False))
    elif action == "create":
        target = Path(sys.argv[3])
        if target.exists():
            raise FileExistsError(f"Refusing to overwrite {target}")
        data = json.loads(Path(source).read_text(encoding="utf-8-sig"))
        deck = Presentation()
        for item in data["slides"]:
            slide = deck.slides.add_slide(deck.slide_layouts[1])
            slide.shapes.title.text = item["title"]
            frame = slide.placeholders[1].text_frame
            frame.clear()
            for index, text in enumerate(item.get("body", [])):
                paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
                paragraph.text = text
        target.parent.mkdir(parents=True, exist_ok=True)
        deck.save(target)
        print(str(target.resolve()))
    else:
        raise ValueError("Expected create or inspect")


if __name__ == "__main__":
    main()
