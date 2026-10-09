#!/usr/bin/env python3
"""Run independent disk checks through a reviewed app adapter, retaining gaps."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from fixture import seed, task
from records import decode, digest, encode, inventory, read_logs, read_records

HERE = Path(__file__).resolve().parent
NOW = "2026-10-07T15:30:00Z"
VERSION = "personal-os-evaluator-v1-experimental"


class CheckFailure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise CheckFailure(message)


def evidence_inventory(root):
    try:
        return inventory(root)
    except (OSError, ValueError) as exc:
        return {"inventory_error": {"type": type(exc).__name__, "message": str(exc)}}


class Driver:
    def __init__(self, root, submission, adapter, timeout):
        self.root = root
        self.vault = seed(root / "vault")
        self.state = root / "state"
        self.state.mkdir()
        self.submission = submission
        self.adapter = adapter
        self.timeout = timeout
        self.calls = []

    def call(self, op, values, status="ok"):
        request = {"version": VERSION, "op": op, "vault_root": str(self.vault),
                   "state_root": str(self.state), "submission_root": str(self.submission),
                   "now": NOW, "input": values}
        command = [sys.executable, str(self.adapter)] if self.adapter.suffix == ".py" else [str(self.adapter)]
        record = {"op": op, "input": values, "before": inventory(self.vault)}
        self.calls.append(record)
        started = time.monotonic()
        try:
            completed = subprocess.run(command, input=json.dumps(request), text=True,
                                       capture_output=True, cwd=self.submission,
                                       timeout=self.timeout, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            record["error"] = type(exc).__name__
            raise CheckFailure(f"Adapter {type(exc).__name__} during {op}") from exc
        finally:
            record["elapsed_seconds"] = time.monotonic() - started
            record["after"] = evidence_inventory(self.vault)
        record["returncode"] = completed.returncode
        record["stderr"] = completed.stderr[-4000:]
        require(completed.returncode == 0, f"Adapter exit {completed.returncode} during {op}")
        try:
            response = json.loads(completed.stdout)
        except ValueError as exc:
            raise CheckFailure(f"Invalid adapter JSON during {op}") from exc
        record["response"] = response
        require(isinstance(response, dict) and response.get("status") in {"ok", "rejected"}, "Invalid response status")
        require(response["status"] == status, f"{op}: expected {status}, got {response['status']}")
        if status == "rejected":
            require(isinstance(response.get("error"), dict) and bool(response["error"].get("code")), "Rejection lacks error code")
        return response.get("result", {})

    def records(self):
        return read_records(self.vault)

    def record(self, task_id):
        records = self.records()
        require(task_id in records, f"Missing record {task_id}")
        return records[task_id]

    def snapshot(self):
        return inventory(self.vault)

    def tasks(self):
        return {key: record for key, record in self.records().items() if record["fields"]["type"] == "task"}

    def unchanged_except(self, before, changed_ids):
        after = self.records()
        require({key: value for key, value in before.items() if key not in changed_ids}
                == {key: value for key, value in after.items() if key not in changed_ids},
                "Operation changed an unrelated record or record identity")


def view_case(d):
    before = d.snapshot()
    expected = {"task-active", "task-start-only", "task-done"}
    for view in ("today", "week", "calendar"):
        result = d.call("view.read", {"view": view, "date": "2026-10-08", "scope": "selected-date"})
        require(isinstance(result, dict), "View result must be an object")
        ids = result.get("task_ids")
        require(isinstance(ids, list) and len(ids) == len(set(ids)) and set(ids) == expected, "Selected-date task set is wrong")
        require(ids[-1] == "task-done", "Completed tasks must follow unfinished tasks")
        require(result.get("today") == "2026-10-08" and result.get("selected_date") == "2026-10-08", "Seoul today/date mismatch")
        require(result.get("planned_minutes") == 60, "Planned minutes must exclude start-only duration")
    result = d.call("view.read", {"view": "backlog", "date": "2026-10-08"})
    require(set(result.get("task_ids", [])) == {"task-overdue", "task-backlog"}, "Backlog must include overdue unfinished and undated work")
    result = d.call("view.read", {"view": "calendar", "date": "2026-10-09", "scope": "selected-date"})
    require(result.get("today") == "2026-10-08" and result.get("selected_date") == "2026-10-09", "Selected date must not replace today")
    require(result.get("task_ids") == ["task-recurring"], "Selecting a date must read that date's tasks")
    require(d.snapshot() == before, "Browsing changed Vault bytes or entries")


def creation_input(request_id):
    fields = task("unused", "동일 제목 생성", scheduled="2026-11-03", start_time="10:00", duration_minutes=25)
    fields.pop("id")
    fields.pop("type")
    return {"request_id": request_id, **fields, "notes": "새 작업 메모.\n"}


def create_case(d):
    before = d.records()
    request = creation_input("create-1")
    d.call("task.create", request)
    after = d.records()
    created = set(after) - set(before)
    require(len(created) == 1, "Creation must persist exactly one new record")
    first = created.pop()
    expected = {key: value for key, value in request.items() if key not in {"request_id", "notes"}}
    require(all(after[first]["fields"].get(key) == value for key, value in expected.items()), "Created task metadata mismatch")
    require(after[first]["body"] == request["notes"], "Task notes not persisted")
    for key in before:
        require(before[key] == after[key], "Creation changed an existing record")
    d.call("task.create", request)
    require(d.records() == after, "Replaying one creation intent duplicated or changed records")
    d.call("task.create", creation_input("create-2"))
    current = d.records()
    require(len(set(current) - set(before)) == 2, "Independent same-title submission was suppressed")
    require(current[first] == after[first], "Second submission replaced the first task")


def invalid_case(d):
    cases = [dict(start_time=None, duration_minutes=10), dict(priority="P0"),
             dict(scheduled_date="2026-02-30"), dict(recurrence={"kind": "weekly", "weekdays": []})]
    for i, changes in enumerate(cases):
        before = d.snapshot()
        request = {**creation_input(f"invalid-{i}"), **changes}
        d.call("task.create", request, status="rejected")
        require(before == d.snapshot(), "Rejected creation changed Vault content")


def state_case(d):
    records = d.records()
    original = d.record("task-active")
    for state in ("completed", "active", "cancelled", "archived", "active"):
        d.call("task.transition", {"id": "task-active", "state": state})
        actual = d.record("task-active")
        expected = {**original["fields"], "state": state}
        require(all(actual["fields"].get(key) == value for key, value in expected.items()) and actual["body"] == original["body"], "State change lost metadata, identity or notes")
        d.unchanged_except(records, {"task-active"})
    before = d.snapshot()
    d.call("task.transition", {"id": "task-active", "state": "archived"}, status="rejected")
    require(before == d.snapshot(), "Illegal transition changed records")
    d.call("task.update", {"id": "task-active", "changes": {"title": "수정한 제목", "notes": "수정한 메모.\n"}})
    actual = d.record("task-active")
    require(all(actual["fields"].get(key) == value for key, value in {**original["fields"], "title": "수정한 제목"}.items()), "Rename changed unrelated fields")
    require(actual["body"] == "수정한 메모.\n", "Edited task note did not persist")
    d.unchanged_except(records, {"task-active"})


def move_case(d):
    records = d.records()
    original = d.record("task-done")
    for destination in ("2026-11-30", None):
        d.call("task.move", {"id": "task-done", "scheduled_date": destination})
        actual = d.record("task-done")
        require(all(actual["fields"].get(key) == value for key, value in {**original["fields"], "scheduled_date": destination}.items()), "Move lost stable identity/state/metadata")
        require(actual["body"] == original["body"], "Move lost notes")
        d.unchanged_except(records, {"task-done"})
    before = d.snapshot()
    d.call("task.move", {"id": "task-active", "scheduled_date": "2026-10-08"})
    require(d.snapshot() == before, "Same-date move wrote records")
    d.call("task.move", {"id": "task-cancelled", "scheduled_date": "2026-10-09"}, status="rejected")
    require(d.snapshot() == before, "Cancelled task moved")


def delete_case(d):
    original = (d.vault / "Tasks/task-active.md").read_bytes()
    records = d.records()
    before = d.snapshot()
    d.call("task.delete", {"id": "task-active", "confirmed": False})
    require(d.snapshot() == before, "Cancelled deletion changed records")
    d.call("task.delete", {"id": "task-active", "confirmed": True})
    after = d.records()
    require("task-active" not in after, "Confirmed deletion did not remove target")
    require(after == {key: value for key, value in records.items() if key != "task-active"}, "Deletion affected other records")
    require(any(name.startswith(".recovery/") and name.endswith("/Tasks/task-active.md")
                and details.get("type") == "file" and details.get("sha256") == digest(original)
                for name, details in d.snapshot().items()), "No exact recoverable pre-delete record")


def note_case(d):
    before = d.snapshot()
    d.call("note.save", {"request_id": "blank", "id": None, "title": "", "body": ""})
    require(before == d.snapshot(), "Blank new note created content")
    records = d.records()
    d.call("note.save", {"request_id": "new-note", "id": None, "title": "새 아이디어", "body": "일반 Markdown **내용**.\n"})
    after = d.records()
    created = set(after) - set(records)
    require(len(created) == 1, "New note was not persisted exactly once")
    note_id = created.pop()
    d.unchanged_except(records, {note_id})
    original = after[note_id]
    require(original["fields"]["type"] == "note" and original["path"] == "Notes/새 아이디어.md" and original["body"] == "일반 Markdown **내용**.\n", "Quick note content mismatch")
    d.call("note.rename", {"id": note_id, "title": "바꾼 이름"})
    renamed = d.record(note_id)
    require(renamed["path"] == "Notes/바꾼 이름.md" and renamed["fields"]["title"] == "바꾼 이름" and renamed["body"] == original["body"], "Note rename lost consistency")
    require(not (d.vault / "Notes/새 아이디어.md").exists(), "Old note file remained after rename")
    d.unchanged_except(records, {note_id})
    before = d.snapshot()
    d.call("note.rename", {"id": note_id, "title": "보존할 메모"}, status="rejected")
    require(before == d.snapshot(), "Note-name collision overwrote content")


def review_case(d):
    before = d.records()
    d.call("review.save", {"date": "2026-10-08", "mood": "만족", "body": "계획과 실제 시간을 돌아봅니다.\n"})
    after = d.records()
    require(after["daily:2026-10-08"]["body"] == "계획과 실제 시간을 돌아봅니다.\n", "Review body missing")
    require(after["daily:2026-10-08"]["fields"]["mood"] == "만족", "Review mood missing")
    for key in before:
        if key != "daily:2026-10-08":
            require(before[key] == after[key], "Daily review changed another record")


def focus_case(d):
    before = d.snapshot()
    records = d.records()
    logs = read_logs(d.vault)
    path = d.vault / "Time Logs/2026-10-08.md"
    prefix = path.read_bytes()
    session = {"session_id": "session-new", "task_id": "task-active", "date": "2026-10-08",
               "started_at": "2026-10-07T15:12:00Z", "finished_at": NOW, "elapsed_seconds": 900}
    d.call("focus.finish", {"confirmed": False, "session": session})
    require(d.snapshot() == before, "Dismissed finish wrote a log")
    d.call("focus.finish", {"confirmed": True, "session": session})
    require(read_logs(d.vault) == logs + [session], "Confirmed finish did not append exactly the expected session")
    require(path.read_bytes().startswith(prefix), "Existing time-log bytes changed")
    d.unchanged_except(records, set())
    after = d.snapshot()
    d.call("focus.finish", {"confirmed": True, "session": session})
    require(d.snapshot() == after, "Same-session replay duplicated/rewrote records")
    d.call("focus.finish", {"confirmed": True, "session": {**session, "elapsed_seconds": 901}}, status="rejected")
    require(d.snapshot() == after, "Conflicting session-ID replay changed records")


def stale_case(d):
    path = d.vault / "Tasks/task-active.md"
    original = path.read_bytes()
    fields, body = decode(original)
    path.write_bytes(encode({**fields, "title": "外部の編集を保存"}, body + "external edit\n"))
    before = d.snapshot()
    d.call("task.update", {"id": "task-active", "changes": {"title": "stale overwrite"}, "expected_sha256": digest(original)}, status="rejected")
    require(d.snapshot() == before, "Stale mutation overwrote the external edit")


def symlink_case(d):
    target = d.vault / "Tasks/task-active.md"
    outside = d.root / "outside-sentinel.md"
    data = target.read_bytes()
    outside.write_bytes(data)
    target.unlink()
    target.symlink_to(outside)
    before = d.snapshot()
    d.call("task.update", {"id": "task-active", "changes": {"title": "escape attempt"}}, status="rejected")
    require(outside.read_bytes() == data and target.is_symlink(), "Symlink target/path was modified")
    require(d.snapshot() == before, "Rejected unsafe edit changed Vault")


def malformed_case(d):
    path = d.vault / "Tasks/task-active.md"
    path.write_bytes(b"---\nid: \xff\n---\noriginal-invalid-bytes\n")
    before = d.snapshot()
    d.call("task.update", {"id": "task-active", "changes": {"title": "erase corruption"}}, status="rejected")
    require(d.snapshot() == before, "Malformed input was replaced instead of preserved")


CASES = {
    "disk.view": view_case, "disk.create": create_case, "disk.invalid-input": invalid_case,
    "disk.states-notes": state_case, "disk.move": move_case, "disk.delete": delete_case,
    "disk.quick-note": note_case, "disk.review": review_case, "disk.focus-log": focus_case,
    "disk.stale": stale_case, "disk.symlink": symlink_case, "disk.malformed": malformed_case,
}


def evaluate(submission, adapter=None, timeout=20):
    rubric = json.loads((HERE / "rubric.json").read_text())
    items = [{**criterion, "status": "not_run", "reason": "Independent execution required", "evidence": []}
             for criterion in rubric["criteria"]]
    by_id = {item["id"]: item for item in items}
    present = submission.is_dir() and any(path.is_file() and not path.is_symlink() for path in submission.rglob("*"))
    by_id["artifact.present"].update(status="pass" if present else "fail",
                                      reason="Nonempty submission artifact; correctness unverified" if present else "Empty or absent submission")
    for case_id, check in CASES.items():
        item = by_id[case_id]
        if adapter is None:
            item["reason"] = "No independently reviewed adapter supplied"
            continue
        if not present:
            item["reason"] = "No submission artifact to exercise"
            continue
        with tempfile.TemporaryDirectory(prefix="personal-os-eval-") as temporary:
            driver = Driver(Path(temporary), submission, adapter, timeout)
            try:
                check(driver)
                item.update(status="pass", reason="Independent disk/output assertions passed through supplied adapter")
            except Exception as exc:
                item.update(status="fail", reason=f"{type(exc).__name__}: {exc}")
            item["evidence"] = driver.calls
            item["final_vault_inventory"] = evidence_inventory(driver.vault)
    tiers = {}
    for tier in sorted({item["tier"] for item in items}):
        group = [item for item in items if item["tier"] == tier]
        passed = sum(item["status"] == "pass" for item in group)
        executed = sum(item["status"] in {"pass", "fail"} for item in group)
        tiers[tier] = {"required": len(group), "executed": executed, "passed": passed,
                       "failed": sum(item["status"] == "fail" for item in group),
                       "execution_coverage": executed / len(group),
                       "pass_fraction_required": passed / len(group) if executed else None}
    failed = any(item["status"] == "fail" for item in items)
    complete = all(item["status"] == "pass" for item in items)
    return {"version": VERSION, "benchmark_revision": rubric["benchmark_revision"],
            "evidence_kind": "supplied_adapter_execution" if adapter else "scaffold_without_app_execution",
            "overall_status": "fail" if failed else "pass" if complete else "incomplete",
            "full_product_verified": complete, "overall_numeric_score": None,
            "reference_time": NOW,
            "adapter_provenance": {"sha256": digest(adapter.read_bytes()) if adapter else None,
                                   "mapping_independently_verified": False,
                                   "note": "Adapter provenance needs evaluator review; disk checks alone cannot establish authentic app execution."},
            "packet_inventory": inventory(HERE.parent / "agent"),
            "evaluator_inventory": {key: value for key, value in inventory(HERE).items() if "__pycache__" not in key},
            "tiers": tiers, "criteria": items,
            "limitations": ["No browser, native lifecycle/menu, packaging, privacy or app-adapter mapping claim from this scaffold.",
                            "No aggregate weighted product score; missing evidence is preserved.",
                            "Temporary test folders are not a sandbox; external isolation is mandatory."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--submission", required=True, type=Path)
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args()
    submission = args.submission.resolve()
    adapter = args.adapter.resolve() if args.adapter else None
    if not submission.is_dir():
        parser.error("--submission must be an existing directory (it may be empty)")
    if adapter and not adapter.is_file():
        parser.error("--adapter must be an existing evaluator-owned file")
    if not 0 < args.timeout <= 300:
        parser.error("--timeout must be positive and at most 300 seconds")
    report = evaluate(submission, adapter, args.timeout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), "overall_status": report["overall_status"],
                      "full_product_verified": report["full_product_verified"], "tiers": report["tiers"]}, ensure_ascii=False))
    return 1 if report["overall_status"] == "fail" else 0


if __name__ == "__main__":
    raise SystemExit(main())
