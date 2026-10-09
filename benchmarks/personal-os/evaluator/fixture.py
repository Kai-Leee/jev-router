"""Author synthetic benchmark input only; never modify a submitted app."""
from pathlib import Path
import json
from records import encode


def task(task_id, title, scheduled="2026-10-08", **overrides):
    fields = {"type": "task", "id": task_id, "title": title, "state": "active",
              "scheduled_date": scheduled, "priority": "P2", "context_id": "project-demo",
              "category_id": "category-deep", "tags": ["연구", "개인"],
              "start_time": None, "duration_minutes": None, "recurrence": None}
    fields.update(overrides)
    return fields


def seed(root):
    root = Path(root)
    # Refuse an occupied folder; the harness always provides a fresh directory.
    if root.exists() and any(root.iterdir()):
        raise ValueError("Fixture destination must be empty")
    root.mkdir(parents=True, exist_ok=True)
    documents = {
        "Tasks/task-active.md": (task("task-active", "연구 결과 정리", start_time="09:00", duration_minutes=45,
                                      external_marker={"preserve": "opaque-value"}), "외부 편집기에서 작성한 메모.\n\n- 보존할 항목\n"),
        "Tasks/task-start-only.md": (task("task-start-only", "연구 결과 정리", start_time="11:30"), "시작 시간만 정한 작업.\n"),
        "Tasks/task-done.md": (task("task-done", "완료된 작업", state="completed", start_time="08:00", duration_minutes=15), "완료 메모.\n"),
        "Tasks/task-overdue.md": (task("task-overdue", "지난 작업", scheduled="2026-10-06"), ""),
        "Tasks/task-backlog.md": (task("task-backlog", "언젠가 읽을 자료", scheduled=None, context_id="area-study", category_id=None), ""),
        "Tasks/task-cancelled.md": (task("task-cancelled", "취소된 작업", state="cancelled"), ""),
        "Tasks/task-recurring.md": (task("task-recurring", "주간 회고", scheduled="2026-10-09", recurrence={"kind": "weekly", "weekdays": [5]}), ""),
        "Projects/project-demo.md": ({"type": "project", "id": "project-demo", "name": "가상 연구 프로젝트"}, "합성 프로젝트.\n"),
        "Areas/area-study.md": ({"type": "area", "id": "area-study", "name": "학습"}, "합성 영역.\n"),
        "Categories/category-deep.md": ({"type": "category", "id": "category-deep", "name": "집중", "color": "#3155AA"}, ""),
        "Notes/보존할 메모.md": ({"type": "note", "id": "note-existing", "title": "보존할 메모"}, "이 메모는 다른 메모가 덮어쓰면 안 됩니다.\n"),
        "Daily/2026-10-08.md": ({"type": "daily", "date": "2026-10-08", "mood": "차분함"}, "기존 회고.\n"),
    }
    for name, (fields, body) in documents.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encode(fields, body))
    log = {"session_id": "session-existing", "task_id": "task-active", "date": "2026-10-08",
           "started_at": "2026-10-07T15:00:00Z", "finished_at": "2026-10-07T15:10:00Z", "elapsed_seconds": 480}
    path = root / "Time Logs/2026-10-08.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("# Focus sessions — 2026-10-08\n\n```personal-os-focus\n" + json.dumps(log, ensure_ascii=False) + "\n```\n", encoding="utf-8")
    return root
