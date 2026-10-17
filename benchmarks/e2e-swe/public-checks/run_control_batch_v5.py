#!/usr/bin/env python3
"""D071 controls for public v4; run in the pinned offline container."""
import argparse
import concurrent.futures
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time


HERE = Path(__file__).resolve().parent


def execute(suite, binding, test_ids=None):
    with tempfile.TemporaryDirectory(prefix="public-v4-control-binding-") as temporary:
        path = Path(temporary) / "binding.json"
        path.write_text(json.dumps(binding))
        argv = [sys.executable, str(HERE / "run_public_checks_v5.py"), "--suite", suite, "--binding", str(path)]
        for test_id in test_ids or []:
            argv += ["--only-test-id", test_id]
        directory = HERE / "controls" / "d065_cli_project" if suite == "cli-config-environment" else HERE
        started = time.monotonic()
        try:
            result = subprocess.run(argv, cwd=directory, capture_output=True, text=True, timeout=300)
            return {"returncode": result.returncode, "report": json.loads(result.stdout),
                    "elapsed_seconds": time.monotonic() - started, "working_directory": str(directory)}
        except Exception as exc:
            return {"returncode": None, "report": None, "elapsed_seconds": time.monotonic() - started,
                    "error": {"type": type(exc).__name__, "message": str(exc)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normal-only", action="store_true")
    parser.add_argument("--defect", action="append", default=[])
    parser.add_argument("--suite", action="append", default=[])
    args = parser.parse_args()
    registry = json.loads((HERE / "registry.v5.json").read_text())
    catalog = json.loads((HERE / "controls" / "catalog.v5.json").read_text())
    suites = [check["id"].removeprefix("public.") for check in registry]
    if set(args.suite) - set(suites) or set(args.defect) - {row["defect"] for row in catalog}:
        parser.error("unknown suite or control defect")
    if args.suite:
        suites = [suite for suite in suites if suite in args.suite]
    tasks = [{"kind": "normal", "suite": suite, "defect": "none", "expected_failed_ids": []} for suite in suites]
    if not args.normal_only:
        tasks += [{"kind": "negative", **row} for row in catalog
                  if row["suite"] in suites and (not args.defect or row["defect"] in args.defect)]

    def run(task):
        binding_name = "descriptions.normal.json" if task["suite"] == "description-provenance" else "normal.json"
        binding = json.loads((HERE / "bindings" / binding_name).read_text())
        binding["command"][binding["command"].index("--defect") + 1] = task["defect"]
        if task["suite"] != "description-provenance":
            binding["command"][1] = "benchmarks/e2e-swe/public-checks/controls/generator_v5.py"
        if task["kind"] == "negative":
            binding["kind"] = "authored_defective_local_control"
        return {**task, **execute(task["suite"], binding, task["expected_failed_ids"] if task["kind"] == "negative" else None)}

    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run, tasks))
    environment = {"python": sys.version.split()[0], "dependencies": {
        name: importlib.metadata.version(name) for name in ("httpx", "ruamel.yaml", "setuptools", "pip", "attrs", "jinja2", "typer")}}
    print(json.dumps({"schema_version": "dag-public-control-batch/v1", "public_gate_version": "5",
                      "environment": environment, "results": results, "elapsed_seconds": time.monotonic() - started,
                      "complete_catalog": not args.normal_only and not args.defect and not args.suite}, sort_keys=True))


if __name__ == "__main__":
    main()
