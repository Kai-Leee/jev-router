#!/usr/bin/env python3
"""Finite authored checker control. This is NOT a complete benchmark candidate.

It emits known templates for Public Core/Public Defaults and small layout/diagnostic
documents. --defect inserts one named semantic fault to test rejection. It imports
no checker code, hidden tests, past candidate source, or past grader output.
"""
from __future__ import annotations
import argparse
import importlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlsplit
from urllib.request import urlopen

from templates import source_files


# Mutations break behaviors asserted from the public instruction. Values here are
# intentionally independent of any candidate observation or hidden test result.
MUTATIONS = {
    "truthy_unset": ("types.py", "return False", "return True"),
    "wrong_file_tuple": ("types.py", "return (self.file_name, self.payload, self.mime_type)", "return (self.payload, self.file_name, self.mime_type)"),
    "missing_response_parsed": ("types.py", "parsed: T", "parsed_wrong: T"),
    "optional_default_none": ("models/probe.py", "note: str | Unset = UNSET", "note: str | Unset = None"),
    "wrong_json_name": ("models/probe.py", '"string_prop": "stringProp"', '"string_prop": "string_prop"'),
    "required_key_wrong_error": ("models/_support.py", "raise KeyError(key)", "raise ValueError(key)"),
    "nonstring_annotations": ("models/probe.py", "from __future__ import annotations\n", ""),
    "scalar_number_string": ("models/scalar_probe.py", "    anything: Any", '    anything: Any\n    _decoders = {"amount": str}'),
    "date_decode_raw": ("models/format_probe.py", '"day": datetime.date.fromisoformat', '"day": lambda value: value'),
    "nested_decode_raw": ("models/collections_probe.py", '"child": Child.from_dict', '"child": lambda value: value'),
    "array_decode_raw": ("models/collections_probe.py", '"records": lambda data: [Child.from_dict(item) for item in data]', '"records": lambda data: data'),
    "drop_additional": ("models/_support.py", "result.additional_properties = {key: value for key, value in data.items() if key not in known}", "result.additional_properties = {}"),
    "missing_doc_colon": ("models/probe.py", "note (str | Unset):", "note (str | Unset)"),
    "enum_accepts_invalid": ("models/color.py", '    A = "a"', '    @classmethod\n    def _missing_(cls, value):\n        return cls.A\n\n    A = "a"'),
    "string_enum_wrong_name": ("models/color.py", 'VALUE_3 = "123"', 'WRONG_3 = "123"'),
    "integer_enum_wrong_name": ("models/number.py", "VALUE_NEGATIVE_4 = -4", "WRONG_NEGATIVE_4 = -4"),
    "varname_wrong_boundary": ("models/custom_number.py", "MORE_THAN_ON_E = 2", "MORE_THAN_ONE = 2"),
    "const_unvalidated": ("models/enum_probe.py", '"marker": constant', '"marker": lambda value: value'),
    "date_default_raw": ("models/defaults.py", "= datetime.date(2020, 1, 2)", '= "2020-01-02"'),
    "numeric_default_raw": ("models/defaults.py", "count: int | Unset = 4", 'count: int | Unset = "4"'),
    "boolean_default_raw": ("models/defaults.py", "lower_false: bool | Unset = False", 'lower_false: bool | Unset = "false"'),
    "enum_default_raw": ("models/defaults.py", "color: Color | Unset = Color.A", 'color: Color | Unset = "a"'),
    "missing_model_export": ("models/__init__.py", "from .status import Status\n", ""),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--defect", default="none")
    commands = parser.add_subparsers(dest="command", required=True)
    generate = commands.add_parser("generate")
    declared_defect = sys.argv[sys.argv.index("--defect") + 1] if "--defect" in sys.argv else "none"
    source = generate.add_argument_group() if declared_defect == "cli_selectors_accept_both" else generate.add_mutually_exclusive_group(required=True)
    source.add_argument("--path", type=Path)
    source.add_argument("--url")
    generate.add_argument("--config", type=Path)
    generate.add_argument("--meta", choices=("none", "poetry", "setup", "pdm", "uv"), default="poetry")
    generate.add_argument("--output-path", type=Path)
    generate.add_argument("--overwrite", action="store_true")
    generate.add_argument("--fail-on-warning", action="store_true")
    args = parser.parse_args()
    location = str(args.path) if args.path else args.url
    raw = args.path.read_text(encoding="utf-8") if args.path else urlopen(args.url, timeout=5).read().decode("utf-8")
    suffix = Path(urlsplit(location).path).suffix
    try:
        if suffix == ".json" and args.defect not in ("cli_suffix_ignored", "cli_json_parser_wrong") or args.defect == "cli_yaml_ignored":
            doc = json.loads(raw)
        else:
            from ruamel.yaml import YAML
            doc = YAML(typ="safe").load(raw)
    except Exception:
        message = "Invalid JSON" if suffix == ".json" else "Invalid YAML"
        print("Malformed input" if args.defect == "cli_diagnostic_message_wrong" else message, file=sys.stderr)
        return 1
    config = {}
    if args.config:
        if args.config.suffix == ".json" and args.defect != "cli_json_parser_wrong":
            config = json.loads(args.config.read_text(encoding="utf-8"))
        else:
            from ruamel.yaml import YAML
            config = YAML(typ="safe").load(args.config.read_text(encoding="utf-8"))
    if isinstance(doc, dict) and "swagger" in doc:
        if args.defect != "swagger_accepted":
            print("Swagger 2.0 is unsupported", file=sys.stderr)
            return 1
        doc = {"openapi": "3.1.0", "info": {"title": "Old API", "version": "1"}, "paths": {}}
    valid = isinstance(doc, dict) and isinstance(doc.get("openapi"), str) and doc["openapi"].startswith(("3.0.", "3.1.")) and isinstance(doc.get("info"), dict)
    valid = valid and bool(doc["info"].get("title")) and bool(doc["info"].get("version")) and "paths" in doc
    if not valid:
        if args.defect != "invalid_structure_accepted":
            print("Failed to parse OpenAPI document", file=sys.stderr)
            return 1
        doc = {"openapi": "3.1.0", "info": {"title": "Invalid Accepted", "version": "1"}, "paths": {}}
    project = re.sub(r"[^a-z0-9]+", "-", doc["info"]["title"].lower()).strip("-") + "-client"
    package = project.replace("-", "_")
    if args.defect == "wrong_package_name":
        package = "wrong_name"
    meta = "none" if args.defect == "wrong_default_meta" and "--meta" not in sys.argv else args.meta
    output = args.output_path or Path(package if meta == "none" else project)
    if output.exists():
        if not args.overwrite and args.defect != "overwrite_ignored":
            print("Output directory already exists", file=sys.stderr)
            return 1
        shutil.rmtree(output)
    directory = output if meta == "none" else output / package
    if args.defect == "none_nested_package" and meta == "none":
        directory = output / package
    if args.defect == "project_package_missing" and meta != "none":
        directory = output
    schemas = doc.get("components", {}).get("schemas", {})
    variant = "core" if doc["info"]["title"] == "Public Core" else "defaults" if doc["info"]["title"] == "Public Defaults" else "survivor" if "Survivor" in schemas else "empty"
    files = None
    for name in ("d065_models", "d065_http", "d065_cli"):
        if (Path(__file__).parent / (name + ".py")).is_file():
            files = importlib.import_module(name).build_control_files(doc, config, args.defect)
            if files is not None:
                break
    files = source_files(variant) if files is None else files
    if args.defect in MUTATIONS:
        name, before, after = MUTATIONS[args.defect]
        if name in files:
            if before not in files[name]:
                raise ValueError(f"control mutation {args.defect} did not match its template")
            files[name] = files[name].replace(before, after)
    if args.defect == "missing_runtime_module":
        del files["errors.py"]
    warnings = []
    for name, schema in schemas.items():
        if "enum" in schema and len({type(item) for item in schema["enum"]}) > 1:
            warnings.append(name)
        if schema.get("type") == "array" and "items" not in schema and "prefixItems" not in schema:
            warnings.append(name)
    if "Affected" in schemas and "LoopA" in schemas and "LoopB" in schemas and args.defect != "circular_warning_missing":
        warnings.append("Circular reference in Affected")
    if args.defect == "unsupported_schema_kept":
        for name in ("MixedEnum", "UntypedArray"):
            filename = "mixed_enum" if name == "MixedEnum" else "untyped_array"
            if name in schemas:
                files[f"models/{filename}.py"] = f"class {name}:\n    pass\n"
                files["models/__init__.py"] += f"from .{filename} import {name}\n"
    for name, text in files.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    if meta != "none" or args.defect == "none_adds_metadata":
        version = "0.0.0" if args.defect == "cli_metadata_version_wrong" else doc["info"]["version"]
        (output / "pyproject.toml").write_text(f'[project]\nname = "{project}"\nversion = "{version}"\ndependencies = ["httpx"]\n', encoding="utf-8")
        (output / "README.md").write_text(project + "\n", encoding="utf-8")
        (output / ".gitignore").write_text("__pycache__/\n", encoding="utf-8")
        if meta == "setup" and args.defect != "cli_setup_metadata_missing":
            (output / "setup.py").write_text("from setuptools import setup\nsetup()\n", encoding="utf-8")
    if args.defect != "http_hooks_skipped":
        for command in config.get("post_hooks", []):
            hook = subprocess.run(command, shell=True, cwd=output, capture_output=True, text=True)
            if hook.stdout:
                print(hook.stdout, end="")
            if hook.returncode:
                warnings.append("Post hook command failed or was not found: " + command)
    for warning in warnings:
        print("Warning: " + warning, file=sys.stderr)
    return 1 if warnings and args.fail_on_warning and args.defect != "warning_flag_ignored" else 0


if __name__ == "__main__":
    raise SystemExit(main())
