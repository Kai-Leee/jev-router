#!/usr/bin/env python3
"""Evaluator-only, source-pinned E2E-SWE Docker adapter; never calls a model API."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MANIFEST = json.loads((HERE / "manifest.json").read_text())
UPSTREAM = ROOT / ".benchmarks/E2E-SWE"
TASK = UPSTREAM / "tasks" / MANIFEST["task_id"]
LABEL = "org.jev-router.e2e-swe"
MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024


class OutputLimitExceeded(RuntimeError):
    """The client exceeded the combined stdout/stderr budget; no result is accepted."""


def command(args, *, timeout=60, check=True):
    deadline = time.monotonic() + timeout
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    captured = 0
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               bufsize=0, start_new_session=True)
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ, "stdout")
            selector.register(process.stderr, selectors.EVENT_READ, "stderr")
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(args, timeout)
                for key, _ in selector.select(timeout=remaining):
                    chunk = os.read(key.fd, 64 * 1024)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    captured += len(chunk)
                    if captured > MAX_COMMAND_OUTPUT_BYTES:
                        raise OutputLimitExceeded(
                            f"Command output exceeded {MAX_COMMAND_OUTPUT_BYTES} combined stdout/stderr bytes")
                    buffers[key.data].extend(chunk)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(args, timeout)
            returncode = process.wait(timeout=remaining)
    except BaseException:
        # A new session isolates this command's client/children from the calling host runner.
        # Killing docker exec's client does not stop its container; grade() removes that verifier.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        raise
    finally:
        process.stdout.close()
        process.stderr.close()
    result = subprocess.CompletedProcess(args, returncode,
                                         buffers["stdout"].decode("utf-8", errors="replace"),
                                         buffers["stderr"].decode("utf-8", errors="replace"))
    if check and result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {args[0:3]}\n{result.stderr[-4000:]}")
    return result


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2) + "\n")


def new_directory(path):
    path = Path(path).absolute()
    path.mkdir(parents=True, exist_ok=False)
    return path


def source_preflight():
    actual_commit = command(["git", "-C", str(UPSTREAM), "rev-parse", "HEAD"]).stdout.strip()
    if actual_commit != MANIFEST["upstream_commit"]:
        raise RuntimeError("Upstream commit differs from pinned manifest")
    for relative, expected in MANIFEST["upstream_sha256"].items():
        path = UPSTREAM / relative
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Upstream file differs from manifest: {relative}")
    expected_tests = {relative for relative in MANIFEST["upstream_sha256"]
                      if relative.startswith(f"tasks/{MANIFEST['task_id']}/tests/")}
    actual_tests = set()
    for path in (TASK / "tests").rglob("*"):
        if path.is_symlink():
            raise RuntimeError("Upstream test directory contains an unexpected symlink")
        if path.is_file():
            actual_tests.add(str(path.relative_to(UPSTREAM)))
    if actual_tests != expected_tests:
        raise RuntimeError("Upstream test-directory inventory differs from pinned manifest")
    return {"upstream_commit": actual_commit, "task_id": MANIFEST["task_id"],
            "verified_files": len(MANIFEST["upstream_sha256"]), "model_calls": 0}


def inspect_image(reference):
    return json.loads(command(["docker", "image", "inspect", reference]).stdout)[0]


def lock_image(output):
    source_preflight()
    info = inspect_image(MANIFEST["image_tag"])
    repository = MANIFEST["image_tag"].rsplit(":", 1)[0]
    digests = [d for d in info.get("RepoDigests", []) if d.startswith(repository + "@sha256:")]
    if len(digests) != 1:
        raise RuntimeError("Expected exactly one repository digest; pull the declared image first")
    if digests[0] != MANIFEST["image_digest"]:
        raise RuntimeError("Declared image tag has drifted from the validated manifest digest")
    record = {"schema_version": 1, "image_tag": MANIFEST["image_tag"], "image_digest": digests[0],
              "image_id": info["Id"], "architecture": info["Architecture"], "os": info["Os"],
              "size_bytes": info["Size"], "locked_at": datetime.now(timezone.utc).isoformat()}
    with Path(output).open("x") as stream:
        json.dump(record, stream, indent=2)
        stream.write("\n")
    return record


def validated_image(path):
    record = json.loads(Path(path).read_text())
    repository = MANIFEST["image_tag"].rsplit(":", 1)[0]
    if record.get("image_tag") != MANIFEST["image_tag"] or not re.fullmatch(
            re.escape(repository) + r"@sha256:[a-f0-9]{64}", record.get("image_digest", "")):
        raise RuntimeError("Image lock does not match selected task")
    if record["image_digest"] != MANIFEST["image_digest"]:
        raise RuntimeError("Image lock differs from the validated manifest digest")
    info = inspect_image(record["image_digest"])
    if info["Id"] != record["image_id"] or info["Architecture"] != record["architecture"]:
        raise RuntimeError("Installed image identity differs from lock")
    return record


def owned_container(name, role=None):
    info = json.loads(command(["docker", "container", "inspect", name]).stdout)[0]
    label = info["Config"].get("Labels", {}).get(LABEL)
    if label != MANIFEST["upstream_commit"]:
        raise RuntimeError("Container is not owned by this pinned adapter")
    if role is not None and info["Config"].get("Labels", {}).get(LABEL + ".role") != role:
        raise RuntimeError("Container has the wrong role")
    return info


def create_container(name, image, role):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}", name):
        raise ValueError("Invalid container name")
    resources = MANIFEST["resources"]
    command(["docker", "create", "--name", name, "--network", "none", "--cpus", str(resources["cpus"]),
             "--memory", str(resources["memory_mb"]) + "m", "--workdir", "/app",
             "--label", "org.jev-router.benchmark=true",
             "--label", "org.jev-router.benchmark.role=" + role,
             "--label", LABEL + "=" + MANIFEST["upstream_commit"],
             "--label", LABEL + ".role=" + role, "--entrypoint", "/bin/bash",
             image["image_digest"], "-c", "sleep infinity"])
    try:
        command(["docker", "start", name])
        command(["docker", "exec", name, "/bin/bash", "-c",
                 'test -d /app && test -z "$(ls -A /app)" && test ! -e /tests'])
    except Exception:
        command(["docker", "rm", "-f", name], check=False)
        raise


def start_agent(args):
    source_preflight()
    image = validated_image(args.image_lock)
    receipt = Path(args.output)
    if receipt.exists():
        raise FileExistsError(receipt)
    # The container is intentionally retained for the caller's controlled shell runner.
    create_container(args.name, image, "agent")
    try:
        command(["docker", "cp", str(TASK / "instruction.md"), args.name + ":/app/instruction.md"])
    except Exception:
        command(["docker", "rm", "-f", args.name], check=False)
        raise
    info = owned_container(args.name, "agent")
    result = {"schema_version": 1, "container": args.name, "container_id": info["Id"],
              "cwd": "/app", "image": image,
              "network": "none", "agent_input_files": ["/app/instruction.md"],
              "upstream_commit": MANIFEST["upstream_commit"], "task_id": MANIFEST["task_id"],
              "storage_limit_enforced": False, "agent_timeout_enforced_by": "host runner",
              "created_at": datetime.now(timezone.utc).isoformat()}
    write_json(receipt, result)
    return result


def export_artifact(args):
    owned_container(args.container, "agent")
    output = new_directory(args.output)
    command(["docker", "cp", args.container + ":/app/.", str(output)], timeout=300)
    return {"artifact_path": str(output), "container": args.container, "exported": True}


def prepare_control(args):
    source_preflight()
    if args.control == "oracle":
        if not args.oracle_source:
            raise ValueError("oracle requires --oracle-source with the pinned evaluator-only clone")
        source = Path(args.oracle_source).resolve(strict=True)
        commit = command(["git", "-C", str(source), "rev-parse", "HEAD"]).stdout.strip()
        if commit != MANIFEST["oracle_commit"]:
            raise RuntimeError("Oracle repository commit is not the pinned upstream solution commit")
        dirty = command(["git", "-C", str(source), "status", "--porcelain"]).stdout.strip()
        if dirty:
            raise RuntimeError("Oracle clone must have a clean worktree")
    output = new_directory(args.output)
    if args.control == "oracle":
        shutil.copytree(source, output, dirs_exist_ok=True, symlinks=True)
        # Identical setup command to the pinned upstream solution/solve.sh.
        (output / "setup.sh").write_text("pip install -e . --no-build-isolation\n")
    else:
        (output / "setup.sh").write_text("#!/bin/bash\nexit 0\n")
    return {"control": args.control, "workspace": str(output), "model_calls": 0}


def evaluate_result(output):
    verifier = Path(output) / "verifier"
    reward_path, ctrf_path = verifier / "reward.txt", verifier / "ctrf.json"
    reward = reward_path.read_text().strip() if reward_path.exists() else None
    if reward not in ("0", "1"):
        return {"grading_status": "invalid", "resolved": None, "reason": "missing_or_invalid_reward"}
    if not ctrf_path.exists():
        return {"grading_status": "invalid", "resolved": None, "reason": "missing_ctrf", "reward": int(reward)}
    ctrf = json.loads(ctrf_path.read_text())
    results = ctrf.get("results", {})
    summary, tests = results.get("summary", {}), results.get("tests", [])
    expected = MANIFEST["test_case_count"]
    statuses = ("passed", "failed", "skipped", "pending", "other")
    if (not isinstance(tests, list) or summary.get("tests") != len(tests)
            or any(t.get("status") not in statuses for t in tests)
            or any(summary.get(status, 0) != sum(t.get("status") == status for t in tests)
                   for status in statuses)):
        return {"grading_status": "invalid", "resolved": None,
                "reason": "ctrf_summary_record_disagreement", "summary": summary}
    all_passed = (summary.get("tests") == expected and summary.get("passed") == expected
                  and len(tests) == expected and all(t.get("status") == "passed" for t in tests)
                  and all(summary.get(field, 0) == 0 for field in ("failed", "skipped", "pending", "other")))
    if (reward == "1") != all_passed:
        return {"grading_status": "invalid", "resolved": None, "reason": "reward_ctrf_disagreement", "summary": summary}
    return {"grading_status": "completed", "resolved": reward == "1", "reward": int(reward),
            "summary": summary, "observed_test_records": len(tests), "expected_test_count": expected,
            "expected_test_count_observed": len(tests) == expected,
            "partial_pass_fraction_is_benchmark_score": False}


def grade(args):
    source_preflight()
    image = validated_image(args.image_lock)
    workspace = Path(args.workspace).absolute()
    if workspace.is_symlink() or not workspace.is_dir():
        raise ValueError("Workspace must be a real directory")
    output = new_directory(args.output)
    name = "jev-e2eswe-verifier-" + uuid.uuid4().hex[:12]
    started = time.monotonic()
    record = {"adapter": MANIFEST["adapter"], "upstream_commit": MANIFEST["upstream_commit"],
              "task_id": MANIFEST["task_id"], "image": image, "workspace": str(workspace),
              "network": "none", "fresh_verifier": True, "container": name, "model_calls": 0,
              "started_at": datetime.now(timezone.utc).isoformat()}
    created = False
    try:
        create_container(name, image, "verifier")
        created = True
        command(["docker", "cp", str(workspace) + "/.", name + ":/app/"], timeout=300)
        command(["docker", "cp", str(TASK / "tests"), name + ":/tests"], timeout=300)
        command(["docker", "exec", name, "mkdir", "-p", "/logs/verifier"])
        execution = command(["docker", "exec", "--workdir", "/app", name, "bash", "/tests/test.sh"],
                            timeout=MANIFEST["verifier_timeout_sec"], check=False)
        (output / "verifier.stdout.log").write_text(execution.stdout)
        (output / "verifier.stderr.log").write_text(execution.stderr)
        record["verifier_process_returncode"] = execution.returncode
        command(["docker", "cp", name + ":/logs/verifier", str(output)], timeout=300)
        record.update(evaluate_result(output))
        if execution.returncode != 0:
            record.update(grading_status="invalid", resolved=None, reason="verifier_process_error")
    except Exception as exc:
        record.update(grading_status="error", resolved=None, reason=type(exc).__name__, error=str(exc))
    finally:
        if created:
            try:
                removed = command(["docker", "rm", "-f", name], check=False)
                record["container_removed"] = removed.returncode == 0
            except Exception as exc:
                record["container_removed"] = False
                record["cleanup_error"] = str(exc)
        record["elapsed_sec"] = time.monotonic() - started
        write_json(output / "result.json", record)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("preflight")
    lock = commands.add_parser("lock-image")
    lock.add_argument("--output", required=True)
    agent = commands.add_parser("start-agent")
    agent.add_argument("--name", required=True)
    agent.add_argument("--image-lock", required=True)
    agent.add_argument("--output", required=True)
    export = commands.add_parser("export")
    export.add_argument("--container", required=True)
    export.add_argument("--output", required=True)
    control = commands.add_parser("prepare-control")
    control.add_argument("control", choices=["noop", "oracle"])
    control.add_argument("--oracle-source")
    control.add_argument("--output", required=True)
    grader = commands.add_parser("grade")
    grader.add_argument("--workspace", required=True)
    grader.add_argument("--image-lock", required=True)
    grader.add_argument("--output", required=True)
    check = commands.add_parser("check-result")
    check.add_argument("--output", required=True)
    args = parser.parse_args()
    actions = {"preflight": lambda: source_preflight(), "lock-image": lambda: lock_image(args.output),
               "start-agent": lambda: start_agent(args), "export": lambda: export_artifact(args),
               "prepare-control": lambda: prepare_control(args), "grade": lambda: grade(args),
               "check-result": lambda: evaluate_result(args.output)}
    result = actions[args.action]()
    print(json.dumps(result, indent=2))
    return 2 if result.get("grading_status") in ("error", "invalid") else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(2)
