"""Checks prevent an untrusted or incomplete verifier receipt being called a pass."""

import importlib.util
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("e2eswe_adapter", Path(__file__).with_name("adapter.py"))
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


class ResultContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name)
        (self.output / "verifier").mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def receipt(self, reward="1", passed=30, failed=0, skipped=0, records=None, status=None):
        (self.output / "verifier/reward.txt").write_text(reward)
        statuses = ["passed"] * passed + ["failed"] * failed + ["skipped"] * skipped
        if records is not None:
            statuses = statuses[:records]
        if status is not None:
            statuses = [status] * len(statuses)
        adapter.write_json(self.output / "verifier/ctrf.json", {"results": {
            "summary": {"tests": 30, "passed": passed, "failed": failed, "skipped": skipped},
            "tests": [{"name": str(i), "status": value} for i, value in enumerate(statuses)]}})

    def test_complete_upstream_count_is_pass(self):
        self.receipt()
        result = adapter.evaluate_result(self.output)
        self.assertEqual(result["grading_status"], "completed")
        self.assertIs(result["resolved"], True)

    def test_partial_success_remains_unresolved(self):
        self.receipt(reward="0", passed=29, failed=1)
        result = adapter.evaluate_result(self.output)
        self.assertEqual(result["reward"], 0)
        self.assertIs(result["resolved"], False)

    def test_reward_cannot_override_failed_suite(self):
        self.receipt(passed=29, failed=1)
        result = adapter.evaluate_result(self.output)
        self.assertEqual(result["reason"], "reward_ctrf_disagreement")
        self.assertIsNone(result["resolved"])

    def test_full_pass_cannot_be_reported_as_zero(self):
        self.receipt(reward="0")
        self.assertEqual(adapter.evaluate_result(self.output)["reason"], "reward_ctrf_disagreement")

    def test_skipped_test_prevents_pass(self):
        self.receipt(skipped=1)
        self.assertEqual(adapter.evaluate_result(self.output)["grading_status"], "invalid")

    def test_fewer_records_prevent_pass(self):
        self.receipt(records=29)
        self.assertEqual(adapter.evaluate_result(self.output)["grading_status"], "invalid")

    def test_test_status_cannot_be_overridden_by_summary(self):
        self.receipt(status="failed")
        self.assertEqual(adapter.evaluate_result(self.output)["grading_status"], "invalid")

    def test_negative_reward_does_not_hide_inconsistent_ctrf(self):
        self.receipt(reward="0", passed=29, failed=1, status="passed")
        result = adapter.evaluate_result(self.output)
        self.assertEqual(result["reason"], "ctrf_summary_record_disagreement")
        self.assertIsNone(result["resolved"])

    def test_missing_verifier_data_is_not_semantic_failure(self):
        self.assertIsNone(adapter.evaluate_result(self.output)["resolved"])
        (self.output / "verifier/reward.txt").write_text("0")
        result = adapter.evaluate_result(self.output)
        self.assertEqual(result["reason"], "missing_ctrf")
        self.assertIsNone(result["resolved"])

    def test_invalid_reward_is_not_coerced(self):
        self.receipt(reward="0.5")
        self.assertEqual(adapter.evaluate_result(self.output)["grading_status"], "invalid")

    def test_collection_failure_has_zero_tests_and_is_unresolved(self):
        (self.output / "verifier/reward.txt").write_text("0")
        adapter.write_json(self.output / "verifier/ctrf.json", {"results": {
            "summary": {"tests": 0, "passed": 0, "failed": 0}, "tests": []}})
        result = adapter.evaluate_result(self.output)
        self.assertIs(result["resolved"], False)
        self.assertEqual(result["observed_test_records"], 0)
        self.assertIs(result["expected_test_count_observed"], False)


class ContainerBoundaryTests(unittest.TestCase):
    def test_role_labels_and_positive_resource_bounds_are_explicit(self):
        for role in ("agent", "verifier"):
            with self.subTest(role=role), patch.object(adapter, "command") as command:
                adapter.create_container("jev-label-test", {"image_digest": "image@sha256:fixture"}, role)
                create = command.call_args_list[0].args[0]
                self.assertIn("org.jev-router.benchmark=true", create)
                self.assertIn("org.jev-router.benchmark.role=" + role, create)
                self.assertIn(adapter.LABEL + ".role=" + role, create)
                self.assertGreater(float(create[create.index("--cpus") + 1]), 0)
                self.assertGreater(int(create[create.index("--memory") + 1].removesuffix("m")), 0)
                self.assertEqual(create[create.index("--network") + 1], "none")
                self.assertNotIn("--mount", create)
                self.assertNotIn("--volume", create)


class CommandBoundTests(unittest.TestCase):
    def test_completed_process_api_preserves_both_streams_and_return_code(self):
        result = adapter.command([adapter.sys.executable, "-c",
                                  "import sys; print('stdout'); print('stderr', file=sys.stderr); sys.exit(3)"],
                                 check=False)
        self.assertEqual(result.stdout, "stdout\n")
        self.assertEqual(result.stderr, "stderr\n")
        self.assertEqual(result.returncode, 3)

    def test_output_limit_combines_streams_and_terminates_noisy_client(self):
        processes = []
        real_popen = adapter.subprocess.Popen

        def remember(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        script = "import os,time; os.write(1, b'x' * (3*1024*1024)); os.write(2, b'y' * (3*1024*1024)); time.sleep(60)"
        with patch.object(adapter.subprocess, "Popen", side_effect=remember):
            with self.assertRaises(adapter.OutputLimitExceeded):
                adapter.command([adapter.sys.executable, "-c", script], timeout=5, check=False)
        self.assertIsNotNone(processes[0].poll())

    def test_timeout_terminates_client_without_returning_a_partial_success(self):
        processes = []
        real_popen = adapter.subprocess.Popen

        def remember(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        started = time.monotonic()
        with patch.object(adapter.subprocess, "Popen", side_effect=remember):
            with self.assertRaises(adapter.subprocess.TimeoutExpired):
                adapter.command([adapter.sys.executable, "-c", "import time; print('started', flush=True); time.sleep(60)"],
                                timeout=0.1, check=False)
        self.assertLess(time.monotonic() - started, 3)
        self.assertIsNotNone(processes[0].poll())

    def test_grade_output_error_still_removes_exact_verifier_and_saves_error(self):
        def fake_command(args, **kwargs):
            if args[:3] == ["docker", "exec", "--workdir"]:
                raise adapter.OutputLimitExceeded("test output budget exceeded")
            return adapter.subprocess.CompletedProcess(args, 0, "", "")

        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            output = Path(temp) / "result"
            args = SimpleNamespace(workspace=str(workspace), output=str(output), image_lock="unused")
            with patch.object(adapter, "source_preflight"), patch.object(adapter, "validated_image", return_value={}), \
                    patch.object(adapter, "create_container") as create, \
                    patch.object(adapter, "command", side_effect=fake_command) as commands:
                result = adapter.grade(args)
            container = create.call_args.args[0]
            self.assertEqual(commands.call_args_list[-1].args[0], ["docker", "rm", "-f", container])
            self.assertEqual(result["grading_status"], "error")
            self.assertEqual(result["reason"], "OutputLimitExceeded")
            self.assertIsNone(result["resolved"])
            self.assertIs(result["container_removed"], True)
            self.assertEqual(json.loads((output / "result.json").read_text())["reason"], "OutputLimitExceeded")


if __name__ == "__main__":
    unittest.main()
