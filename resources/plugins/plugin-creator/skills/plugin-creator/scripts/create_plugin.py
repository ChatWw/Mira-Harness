"""Mira local plugin scaffold, adapted to the OpenAI Skills creator workflow."""
import json
import re
import sys
from pathlib import Path


def main():
    parent = Path(sys.argv[1]).expanduser().resolve()
    name = sys.argv[2]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", name):
        raise ValueError("Plugin name must be lower-case letters, digits and hyphens, up to 64 characters")
    root = parent / name
    if root.exists():
        raise FileExistsError(f"Refusing to overwrite {root}")
    catalog_file = parent / "marketplace.json"
    catalog = json.loads(catalog_file.read_text(encoding="utf-8-sig")) if catalog_file.exists() else {"name": "local-dev", "plugins": []}
    if not isinstance(catalog.get("plugins"), list) or any(item.get("name") == name for item in catalog["plugins"]):
        raise ValueError("Invalid marketplace or duplicate plugin name")
    manifest = {"name": name, "version": "0.1.0", "description": f"Local {name} plugin", "skills": "skills"}
    (root / ".mira-plugin").mkdir(parents=True)
    (root / "skills" / name).mkdir(parents=True)
    (root / ".mira-plugin" / "plugin.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "skills" / name / "SKILL.md").write_text(f"---\nname: {name}\ndescription: Local {name} workflow\n---\n\n# {name}\n\nImplement the requested workflow and verify it with a representative task.\n", encoding="utf-8")
    catalog["plugins"].append({**{key: manifest[key] for key in ("name", "description", "version")}, "source": name})
    catalog_file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"plugin": str(root), "marketplace": str(parent), "id": f"{name}@{catalog['name']}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
