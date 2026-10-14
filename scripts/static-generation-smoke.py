#!/usr/bin/env python3
"""D085 static generation smoke (analysis tool, not a check).

Installs the candidate with the pinned public harness, generates a client from every
public fixture, then compiles every generated module and imports every generated
module in a fresh interpreter. No test assertion runs. Output is one JSON object.
"""
import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Literal enums are the one fixture whose public check passes a config.
CONFIGS = {"d065-models-literals.json": {"literal_enums": True}}
IMPORT_ALL = r"""
import importlib, json, sys
from pathlib import Path
root, package = Path(sys.argv[1]), sys.argv[2]
sys.path.insert(0, str(root))
failures, count = [], 0
for path in sorted((root / package).rglob("*.py")):
    parts = path.relative_to(root).with_suffix("").parts
    name = ".".join(parts[:-1] if parts[-1] == "__init__" else parts)
    count += 1
    try:
        importlib.import_module(name)
    except Exception as exc:
        failures.append({"module": name, "code": type(exc).__name__, "message": str(exc)[:300]})
print(json.dumps({"modules": count, "failures": failures}))
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runner", type=Path, required=True)
    parser.add_argument("--binding", type=Path, required=True)
    options = parser.parse_args()
    sys.path.insert(0, str(options.runner.parent))
    spec = importlib.util.spec_from_file_location("public_runner", options.runner)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    binding = json.loads(options.binding.read_text(encoding="utf-8"))
    began = time.monotonic()
    result = {"schema_version": "adaptive-static-generation-smoke/v1", "fixtures": [], "install": None,
              "basis": "controller_static_smoke_not_a_check_result"}
    with tempfile.TemporaryDirectory(prefix="dag-static-smoke-") as scratch_name:
        scratch = Path(scratch_name)
        try:
            harness = runner.Harness(binding, scratch_name)
            result["install"] = {"status": "installed", "seconds": round(time.monotonic() - began, 2)}
        except Exception as exc:
            result["install"] = {"status": "failed", "code": type(exc).__name__, "message": str(exc)[:300]}
            print(json.dumps(result, sort_keys=True))
            return 0
        python = harness.install_receipt["python"]
        for fixture in sorted((options.runner.parent / "fixtures").glob("*.json")):
            started = time.monotonic()
            package = "smoke_" + fixture.stem.replace("-", "_")
            output = scratch / package
            row = {"fixture": fixture.name, "package": package}
            try:
                _, generated = harness.invoke(json.loads(fixture.read_text(encoding="utf-8")), "--meta", "none",
                                              "--output-path", str(output), config=CONFIGS.get(fixture.name))
                row["generator_exit_code"] = generated.returncode
                if generated.returncode != 0:
                    row["generator_error"] = (generated.stdout[-300:] + generated.stderr[-300:]).strip()
            except subprocess.TimeoutExpired:
                row["generator_exit_code"] = None
                row["generator_error"] = "LOCAL_COMMAND_TIMEOUT"
            files = sorted(output.rglob("*.py")) if output.is_dir() else []
            row["files"] = len(files)
            row["syntax_errors"] = []
            for path in files:
                try:
                    compile(path.read_text(encoding="utf-8", errors="replace"), str(path), "exec")
                except SyntaxError as exc:
                    row["syntax_errors"].append({"file": str(path.relative_to(scratch)), "line": exc.lineno, "message": exc.msg})
            if files:
                imported = subprocess.run([python, "-c", IMPORT_ALL, str(scratch), package], capture_output=True, text=True,
                                          timeout=60, env=harness.installed_environment)
                try:
                    report = json.loads(imported.stdout)
                    row["modules"], row["import_failures"] = report["modules"], report["failures"]
                except ValueError:
                    row["modules"], row["import_failures"] = None, [{"code": "IMPORT_RUNNER_FAILED", "message": imported.stderr[-300:]}]
            row["passed"] = (row.get("generator_exit_code") == 0 and bool(files) and not row["syntax_errors"]
                             and not row.get("import_failures"))
            row["seconds"] = round(time.monotonic() - started, 2)
            result["fixtures"].append(row)
    result["seconds"] = round(time.monotonic() - began, 2)
    result["passed"] = all(row["passed"] for row in result["fixtures"])
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
