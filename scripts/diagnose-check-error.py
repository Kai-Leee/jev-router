#!/usr/bin/env python3
"""D085 controller diagnostic for a public check blocked by an import or syntax error.

This is not a check. It re-runs one public suite on the same candidate with the pinned
public runner and, when the suite raises, reports the traceback, the generated tree and
the contents of generated files that the error names or that fail to compile. Only
public fixtures are used. Output is one JSON object on stdout.
"""
import argparse
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

MAX_FILE_CHARS = 12000
MAX_FILES = 4
MAX_TREE = 200
MAX_TRACEBACK_CHARS = 6000
INSTALL_PARTS = ("candidate_venv", "installed_candidate")


def generated_files(scratch):
    rows = []
    for path in sorted(scratch.rglob("*.py")):
        relative = path.relative_to(scratch)
        if relative.parts[0] in INSTALL_PARTS or relative.parts[0].startswith("call_"):
            continue
        rows.append(path)
    return rows


def syntax_problem(path):
    try:
        compile(path.read_text(encoding="utf-8", errors="replace"), str(path), "exec")
    except SyntaxError as exc:
        return {"lineno": exc.lineno, "message": exc.msg}
    return None


def file_record(path, scratch, reason):
    text = path.read_text(encoding="utf-8", errors="replace")
    return {"path": "<scratch>/" + str(path.relative_to(scratch)), "reason": reason, "chars": len(text),
            "truncated": len(text) > MAX_FILE_CHARS, "content": text[:MAX_FILE_CHARS], "syntax_error": syntax_problem(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runner", type=Path, required=True)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--binding", type=Path, required=True)
    options = parser.parse_args()
    sys.path.insert(0, str(options.runner.parent))
    spec = importlib.util.spec_from_file_location("public_runner", options.runner)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    result = {"schema_version": "adaptive-check-error-diagnosis/v1", "suite": options.suite, "reproduced": False,
              "error": None, "traceback": None, "files": [], "generated_tree": [], "generated_tree_truncated": False,
              "outcome_uncertain": False, "basis": "controller_reproduction_of_public_suite_not_a_check_result"}
    binding = json.loads(options.binding.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="dag-check-diagnosis-") as scratch_name:
        scratch = Path(scratch_name).resolve()
        try:
            harness = runner.Harness(binding, scratch_name)
            checks = runner.Checks(set(runner.SUITES[options.suite]))
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                runner.RUNNERS[options.suite](harness, checks)
        except subprocess.TimeoutExpired:
            result["error"] = {"code": "LOCAL_COMMAND_TIMEOUT", "message": "generator exceeded the local command limit"}
        except Exception as exc:  # the suite's own exception is the diagnosis subject
            result["reproduced"] = True
            result["error"] = {"code": type(exc).__name__, "message": str(exc)}
            result["traceback"] = traceback.format_exc().replace(str(scratch), "<scratch>")[-MAX_TRACEBACK_CHARS:]
            named = []
            if isinstance(exc, SyntaxError) and exc.filename:
                named.append((Path(exc.filename), "named_by_error"))
            for frame in traceback.extract_tb(exc.__traceback__):
                named.append((Path(frame.filename), "traceback_frame"))
            if isinstance(exc, ModuleNotFoundError) and exc.name:
                parts = exc.name.split(".")
                for size in range(len(parts) - 1, 0, -1):
                    parent = scratch.joinpath(*parts[:size], "__init__.py")
                    if parent.is_file():
                        named.append((parent, "closest_parent_of_missing_module"))
                        break
            generated = generated_files(scratch)
            named += [(path, "does_not_compile") for path in generated if syntax_problem(path)]
            seen = set()
            for path, reason in named:
                try:
                    resolved = path.resolve()
                    relative = resolved.relative_to(scratch)
                except (OSError, ValueError):
                    continue
                if resolved in seen or relative.parts[0] in INSTALL_PARTS or not resolved.is_file():
                    continue
                seen.add(resolved)
                result["files"].append(file_record(resolved, scratch, reason))
                if len(result["files"]) >= MAX_FILES:
                    break
            result["generated_tree"] = ["<scratch>/" + str(path.relative_to(scratch)) for path in generated[:MAX_TREE]]
            result["generated_tree_truncated"] = len(generated) > MAX_TREE
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
