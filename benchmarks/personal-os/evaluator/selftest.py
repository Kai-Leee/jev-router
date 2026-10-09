#!/usr/bin/env python3
"""Grader validity checks only. No application/reference implementation exists."""
import json
from pathlib import Path
import tempfile
import unittest

from evaluate import CASES, HERE, evaluate
from fixture import seed
from records import InvalidRecord, decode, encode, inventory, read_logs, read_records


class GraderTests(unittest.TestCase):
    def test_fixture_records_and_log_are_valid(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = seed(Path(temporary) / "vault")
            records = read_records(root)
            self.assertEqual(len(records), 12)
            self.assertEqual(sum(r["fields"]["type"] == "task" for r in records.values()), 7)
            self.assertEqual(read_logs(root)[0]["elapsed_seconds"], 480)
            self.assertEqual(records["task-active"]["fields"]["external_marker"], {"preserve": "opaque-value"})

    def test_packaged_synthetic_packet_matches_seed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = seed(Path(temporary) / "vault")
            self.assertEqual(inventory(root), inventory(HERE.parent / "agent/synthetic-vault"))

    def test_frontmatter_rejects_duplicates_and_malformed_utf8(self):
        for data in (b'---\nid: "first"\nid: "second"\n---\n',
                     b'---\nopaque: {"x":1,"x":2}\n---\n',
                     b'---\nvalue: NaN\n---\n',
                     b'---\ntitle: "\xff"\n---\n'):
            with self.assertRaises(InvalidRecord):
                decode(data)

    def test_task_tampering_is_rejected(self):
        mutations = [{"duration_minutes": 10, "start_time": None}, {"scheduled_date": "2026-02-30"},
                     {"context_id": "nonexistent"}, {"tags": ["same", "same"]},
                     {"recurrence": {"kind": "weekly", "weekdays": [1, 1]}}, {"id": "wrong-id"}]
        for changes in mutations:
            with self.subTest(changes=changes), tempfile.TemporaryDirectory() as temporary:
                root = seed(Path(temporary) / "vault")
                path = root / "Tasks/task-active.md"
                fields, body = decode(path.read_bytes())
                path.write_bytes(encode({**fields, **changes}, body))
                with self.assertRaises(InvalidRecord):
                    read_records(root)

    def test_duplicate_and_truncated_focus_blocks_are_rejected(self):
        for mode in ("duplicate", "truncated"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                root = seed(Path(temporary) / "vault")
                path = root / "Time Logs/2026-10-08.md"
                original = path.read_text()
                path.write_text(original + (original if mode == "duplicate" else '```personal-os-focus\n{"broken":true}'))
                with self.assertRaises(InvalidRecord):
                    read_logs(root)

    def test_symlink_is_not_followed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = seed(Path(temporary) / "vault")
            path = root / "Tasks/task-active.md"
            outside = Path(temporary) / "sentinel.md"
            outside.write_bytes(path.read_bytes())
            path.unlink()
            path.symlink_to(outside)
            self.assertEqual(inventory(root)["Tasks/task-active.md"]["type"], "symlink")
            with self.assertRaises(InvalidRecord):
                read_records(root)

    def test_empty_submission_cannot_pass(self):
        with tempfile.TemporaryDirectory() as temporary:
            report = evaluate(Path(temporary))
            self.assertEqual(report["overall_status"], "fail")
            self.assertFalse(report["full_product_verified"])
            self.assertEqual(report["tiers"]["deterministic"]["executed"], 0)

    def test_missing_adapter_is_unverified(self):
        with tempfile.TemporaryDirectory() as temporary:
            submission = Path(temporary)
            (submission / "placeholder.txt").write_text("Synthetic negative control only")
            report = evaluate(submission)
            self.assertEqual(report["overall_status"], "incomplete")
            self.assertFalse(report["full_product_verified"])
            self.assertEqual(report["tiers"]["deterministic"]["executed"], 0)
            self.assertIsNone(report["tiers"]["native"]["pass_fraction_required"])

    def test_false_success_noop_fails_all_automatic_behavior_groups(self):
        with tempfile.TemporaryDirectory() as temporary:
            submission = Path(temporary)
            (submission / "placeholder.txt").write_text("Synthetic negative control only")
            report = evaluate(submission, HERE / "noop_adapter.py")
            self.assertEqual(report["overall_status"], "fail")
            self.assertFalse(report["full_product_verified"])
            automatic = [entry for entry in report["criteria"] if entry["id"] in CASES]
            self.assertEqual(len(automatic), 12)
            self.assertTrue(all(entry["status"] == "fail" for entry in automatic), automatic)
            self.assertEqual(report["tiers"]["browser"]["executed"], 0)
            self.assertEqual(report["tiers"]["native"]["executed"], 0)

    def test_rubric_keeps_full_native_scope_and_exact_automatic_map(self):
        rubric = json.loads((HERE / "rubric.json").read_text())
        ids = [entry["id"] for entry in rubric["criteria"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual({id for id in ids if id.startswith("disk.")}, set(CASES))
        self.assertEqual({id for id in ids if id.startswith("native.")},
                         {"native.desktop-folders", "native.reopen", "native.menu", "native.onboarding"})
        self.assertIsNone(rubric["weights"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
