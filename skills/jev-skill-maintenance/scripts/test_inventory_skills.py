#!/usr/bin/env python3
"""Exercise inventory behavior with fd and isolated filesystem fixtures."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("inventory_skills.py")


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jev-skill-inventory-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.installed = self.root / "installed"
        self.skill = self.source / "example"
        self.skill.mkdir(parents=True)
        self.installed.mkdir()
        (self.skill / "SKILL.md").write_text("---\nname: example\ndescription: Example fixture\n---\n", encoding="utf-8")
        (self.skill / "binary asset.bin").write_bytes(b"\0\xff\x01")

    def run_inventory(self, *extra_roots, expected_code=0):
        command = [sys.executable, str(SCRIPT), "--source-root", str(self.source)]
        for root in (self.installed, *extra_roots):
            command.extend(["--installed-root", str(root)])
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, expected_code, result.stderr or result.stdout)
        return json.loads(result.stdout)

    def test_matching_changed_extra_and_missing_copy(self):
        target = self.installed / "example"
        shutil.copytree(self.skill, target)
        first = self.run_inventory()
        self.assertEqual(first["skills"][0]["copies"][0]["status"], "identical")
        self.assertFalse(first["host_discovery_verified"])
        self.assertFalse(first["host_invocation_verified"])
        (target / "SKILL.md").write_text("changed\n", encoding="utf-8")
        (target / ".extra").write_text("extra\n", encoding="utf-8")
        changed = self.run_inventory()["skills"][0]["copies"][0]
        self.assertEqual(changed["status"], "different")
        self.assertEqual(changed["changed_paths"], [".extra", "SKILL.md"])
        (target / "SKILL.md").unlink()
        self.assertIn("SKILL.md", self.run_inventory()["skills"][0]["copies"][0]["changed_paths"])
        shutil.rmtree(target)
        self.assertEqual(self.run_inventory()["skills"][0]["copies"][0]["status"], "absent")

    def test_missing_root_and_invalid_root_are_distinct(self):
        absent = self.root / "missing"
        invalid = self.root / "not-a-directory"
        invalid.write_text("fixture\n", encoding="utf-8")
        result = self.run_inventory(absent, invalid, expected_code=1)
        self.assertEqual([copy["status"] for copy in result["skills"][0]["copies"]], ["absent", "root_absent", "inspection_error"])

    def test_symlink_installation_and_broken_symlink(self):
        target = self.installed / "example"
        target.symlink_to(self.skill, target_is_directory=True)
        self.assertEqual(self.run_inventory()["skills"][0]["copies"][0]["status"], "same_path")
        target.unlink()
        target.symlink_to(self.root / "missing", target_is_directory=True)
        self.assertEqual(self.run_inventory(expected_code=1)["skills"][0]["copies"][0]["status"], "inspection_error")

    def test_inner_symlink_is_hashed_without_reading_its_target(self):
        outside = self.root / "outside.txt"
        outside.write_text("first\n", encoding="utf-8")
        (self.skill / "linked").symlink_to(outside)
        first = self.run_inventory()["skills"][0]["source"]
        self.assertEqual(first["files"]["linked"]["type"], "symlink")
        outside.write_text("second\n", encoding="utf-8")
        second = self.run_inventory()["skills"][0]["source"]
        self.assertEqual(first, second)

    def test_only_immediate_source_skills_and_no_file_changes(self):
        nested = self.source / "other" / "nested"
        nested.mkdir(parents=True)
        (nested / "SKILL.md").write_text("nested\n", encoding="utf-8")
        first = self.run_inventory()
        self.assertEqual([skill["name"] for skill in first["skills"]], ["example"])
        self.assertEqual(first, self.run_inventory())
        self.assertEqual((self.skill / "binary asset.bin").read_bytes(), b"\0\xff\x01")
        self.assertEqual(list(self.installed.iterdir()), [])

    def test_discovery_error_is_not_reported_as_an_empty_inventory(self):
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        fake_fd = fake_bin / "fd"
        fake_fd.write_text("#!/bin/sh\necho 'permission denied fixture' >&2\nexit 0\n", encoding="utf-8")
        fake_fd.chmod(0o700)
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--source-root", str(self.source)],
            env={**os.environ, "PATH": str(fake_bin)}, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(json.loads(result.stderr)["status"], "inspection_error")
        self.assertIn("permission denied fixture", json.loads(result.stderr)["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
