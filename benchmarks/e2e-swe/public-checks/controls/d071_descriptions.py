#!/usr/bin/env python3
"""Finite independent public description controls, not a product generator.

Reads two public OpenAPI descriptions and emits four tiny callable endpoints. No
checker, past candidate, provider, or hidden grader is imported. Defects exercise
the difference between schema substitution and post-import docstring mutation.
"""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--defect", choices=("none", "schema-description", "runtime-rewrite"), default="none")
    subcommands = parser.add_subparsers(dest="command", required=True)
    generate = subcommands.add_parser("generate")
    generate.add_argument("--path", type=Path, required=True)
    generate.add_argument("--config", type=Path)
    generate.add_argument("--meta", choices=("none",), required=True)
    generate.add_argument("--output-path", type=Path, required=True)
    args = parser.parse_args()
    spec = json.loads(args.path.read_text())
    body = spec["paths"]["/widgets/{itemId}"]["post"]["requestBody"]
    description = body.get("description", "")
    if args.defect == "schema-description":
        description = body["content"]["application/json"]["schema"].get("description", "")
    files = {"__init__.py": "", "api/__init__.py": "", "api/widgets/__init__.py": ""}
    source = ""
    for function in ("sync", "sync_detailed", "asyncio", "asyncio_detailed"):
        source += ("async " if function.startswith("asyncio") else "") + f"def {function}(*, body, client):\n"
        doc = "Upload a public item.\n\nArgs:\n    body (UploadThingBody):" + (" " + description if description else "") + "\n\nReturns:\n    object: Result."
        source += "    " + repr(doc) + "\n    return None\n\n"
    if args.defect == "runtime-rewrite":
        source += "asyncio_detailed.__doc__ = 'Args:\\n    body (UploadThingBody): Wrong runtime source.'\n"
    files["api/widgets/upload_thing.py"] = source
    for name, text in files.items():
        path = args.output_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
