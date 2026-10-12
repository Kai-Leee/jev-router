#!/usr/bin/env python3
"""Execute authored public checker controls inside the pinned offline container."""
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
    with tempfile.TemporaryDirectory(prefix="public-control-binding-") as temporary:
        path = Path(temporary) / "binding.json"
        path.write_text(json.dumps(binding))
        argv = [sys.executable, str(HERE / "run_public_checks.py"), "--suite", suite, "--binding", str(path)]
        for test_id in test_ids or []:
            argv += ["--only-test-id", test_id]
        started = time.monotonic()
        # The original project must be present at cwd, as in candidate containers.
        # Its callable console module must not shadow the installed source query.
        directory = HERE / "controls" / "d065_cli_project" if suite == "cli-config-environment" else HERE
        try:
            result = subprocess.run(argv, cwd=directory, capture_output=True, text=True, timeout=300)
            return {"returncode": result.returncode, "report": json.loads(result.stdout), "elapsed_seconds": time.monotonic() - started,
                    "working_directory": str(directory)}
        except Exception as exc:
            return {"returncode": None, "report": None, "elapsed_seconds": time.monotonic() - started,
                    "error": {"type": type(exc).__name__, "message": str(exc)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normal-only", action="store_true")
    parser.add_argument("--defect", action="append", default=[])
    parser.add_argument("--suite", action="append", default=[])
    args = parser.parse_args()
    registry = json.loads((HERE / "registry.json").read_text())
    catalog = json.loads((HERE / "controls/catalog.json").read_text())
    base = json.loads((HERE / "bindings/normal.json").read_text())
    suites = [check["id"].removeprefix("public.") for check in registry]
    if args.suite:
        suites = [suite for suite in suites if suite in args.suite]
    started = time.monotonic()
    tasks = []
    for suite in suites:
        tasks.append({"kind": "normal", "suite": suite, "defect": "none", "expected_failed_ids": []})
    if not args.normal_only:
        tasks += [{"kind": "negative", **row} for row in catalog if row["suite"] in suites and (not args.defect or row["defect"] in args.defect)]
    def run(task):
        binding = json.loads(json.dumps(base))
        binding["command"][binding["command"].index("--defect") + 1] = task["defect"]
        if task["kind"] == "negative":
            binding["kind"] = "authored_defective_local_control"
        return {**task, **execute(task["suite"], binding, task["expected_failed_ids"] if task["kind"] == "negative" else None)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run, tasks))
    environment = {"python": sys.version.split()[0], "dependencies": {name: importlib.metadata.version(name) for name in ("httpx", "ruamel.yaml", "setuptools", "pip", "attrs", "jinja2", "typer")}}
    print(json.dumps({"schema_version": "dag-public-control-batch/v1", "environment": environment, "results": results,
                      "elapsed_seconds": time.monotonic() - started, "complete_catalog": not args.normal_only and not args.defect and not args.suite}, sort_keys=True))


if __name__ == "__main__":
    main()
