#!/usr/bin/env python3
"""Read-only inventory of source skills and matching copies in explicit roots."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def fd_paths(root, types, max_depth=None):
    command = ["fd", "--hidden", "--no-ignore", "--color", "never", "--absolute-path", "--print0"]
    for entry_type in types:
        command.extend(["--type", entry_type])
    if max_depth is not None:
        command.extend(["--max-depth", str(max_depth)])
    command.extend([".", str(root)])
    result = subprocess.run(command, capture_output=True, check=False)
    if result.returncode or result.stderr.strip():
        message = os.fsdecode(result.stderr).strip() or f"exit {result.returncode}"
        raise OSError(f"fd inspection failed: {message}")
    return sorted(Path(os.fsdecode(value)) for value in result.stdout.split(b"\0") if value)


def tree_snapshot(directory):
    resolved = directory.resolve(strict=True)
    if not resolved.is_dir():
        raise ValueError("skill path is not a directory")
    files = {}
    for path in fd_paths(resolved, ("f", "l")):
        relative = path.relative_to(resolved).as_posix()
        if path.is_symlink():
            payload = os.fsencode(os.readlink(path))
            entry_type = "symlink"
        else:
            payload = path.read_bytes()
            entry_type = "file"
        files[relative] = {"type": entry_type, "sha256": hashlib.sha256(payload).hexdigest()}
    canonical = json.dumps(files, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode()
    return {
        "resolved_path": str(resolved),
        "file_count": len(files),
        "tree_sha256": hashlib.sha256(canonical).hexdigest(),
        "files": files,
    }


def exists_checked(path):
    # Path.exists may hide access errors on some Python versions.
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    return True


def inspect_copy(source, installed_root, skill_name):
    target = installed_root / skill_name
    result = {"installed_root": str(installed_root), "path": str(target)}
    try:
        if not exists_checked(installed_root):
            return {**result, "status": "root_absent"}
        if not installed_root.is_dir():
            raise ValueError("installation root is not a directory")
        if not exists_checked(target):
            return {**result, "status": "absent"}
        snapshot = tree_snapshot(target)
        changed = sorted(
            name for name in source["files"].keys() | snapshot["files"].keys()
            if source["files"].get(name) != snapshot["files"].get(name)
        )
        if snapshot["resolved_path"] == source["resolved_path"]:
            status = "same_path"
        else:
            status = "different" if changed else "identical"
        return {**result, "status": status, **snapshot, "changed_paths": changed}
    except (OSError, ValueError) as error:
        return {**result, "status": "inspection_error", "error": str(error)}


def inventory(source_root, installed_roots):
    if shutil.which("fd") is None:
        raise OSError("fd is required for file discovery; install or make it available before inventory")
    source_root = source_root.expanduser().resolve(strict=True)
    if not source_root.is_dir():
        raise ValueError("source root is not a directory")
    # Keep the requested logical path so a symlink installation can be reported.
    installed_roots = [Path(os.path.abspath(root.expanduser())) for root in installed_roots]
    skills = []
    for directory in fd_paths(source_root, ("d", "l"), max_depth=1):
        entrypoint = directory / "SKILL.md"
        if not directory.is_dir() or not exists_checked(entrypoint):
            continue
        if not entrypoint.is_file():
            raise ValueError(f"source entrypoint is not a regular file: {entrypoint}")
        source = tree_snapshot(directory)
        skills.append({
            "name": directory.name,
            "source_path": str(directory),
            "source": source,
            "copies": [inspect_copy(source, root, directory.name) for root in installed_roots],
        })
    return {
        "schema_version": "jev-skill-inventory/v1",
        "source_root": str(source_root),
        "skills": skills,
        "host_discovery_verified": False,
        "host_invocation_verified": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--installed-root", type=Path, action="append", default=[])
    args = parser.parse_args()
    try:
        result = inventory(args.source_root, args.installed_root)
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "inspection_error", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(any(copy["status"] == "inspection_error" for skill in result["skills"] for copy in skill["copies"]))


if __name__ == "__main__":
    sys.exit(main())
