"""Authored partial controls for D095 boundary predicates, not product evidence."""
import json
from pathlib import Path
import runpy
import sys

args = sys.argv[1:]
def arg(key, default=None):
    return args[args.index(key) + 1] if key in args else default

source = arg("--path")
spec = json.loads(Path(source).read_text()) if source and source.endswith(".json") else {}
title = spec.get("info", {}).get("title")
if title not in ("Public response boundary", "Public prefix boundary"):
    runpy.run_path(str(Path(__file__).with_name("generator.py")), run_name="__main__")
else:
    out = Path(arg("--output-path")); out.mkdir(parents=True)
    (out / "__init__.py").write_text("")
    defect = arg("--defect", "none")
    models = out / "models"; models.mkdir(); (models / "__init__.py").write_text("")
    if title == "Public response boundary":
        api = out / "api"; api.mkdir(); (api / "__init__.py").write_text("")
        default = api / "default"; default.mkdir(); (default / "__init__.py").write_text("")
        text = "def sync(): pass\ndef sync_detailed(): pass\nasync def asyncio(): pass\nasync def asyncio_detailed(): pass\n"
        if defect == "boundary-imports": text = "from ...models import AbsentModel\n" + text
        for operation in spec["paths"].values():
            name = operation["get"]["operationId"]; (default / (name + ".py")).write_text(text)
    else:
        config = json.loads(Path(arg("--config")).read_text()) if arg("--config") else {}
        prefix = config.get("field_prefix", "field_")
        digit = prefix + ("_" if defect == "boundary-prefix" else "") + "7value"
        secret = prefix + "secret"
        (models / "__init__.py").write_text(
            "from dataclasses import dataclass\n@dataclass\nclass BoundaryRecord:\n"
            f"    {digit}: str\n    {secret}: str\n"
            f"    def to_dict(self): return {{'7value': self.{digit}, '_secret': self.{secret}}}\n"
            f"    @classmethod\n    def from_dict(cls, data): return cls(**{{'{digit}': data['7value'], '{secret}': data['_secret']}})\n")
