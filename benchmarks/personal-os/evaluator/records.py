"""Independent reader and authoring helpers for synthetic benchmark records.

This is not an application store: no product mutation operation is implemented.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import re


class InvalidRecord(ValueError):
    pass


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidRecord(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def loads(text):
    def invalid(value):
        raise InvalidRecord(f"Nonfinite JSON value: {value}")
    try:
        return json.loads(text, object_pairs_hook=strict_object, parse_constant=invalid)
    except (ValueError, TypeError) as exc:
        raise InvalidRecord(str(exc)) from exc


def encode(fields, body=""):
    lines = ["---"]
    lines.extend(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in fields.items())
    return ("\n".join(lines) + "\n---\n" + body).encode("utf-8")


def decode(data):
    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeError as exc:
        raise InvalidRecord("Invalid UTF-8") from exc
    if not text.startswith("---\n") or "\n---\n" not in text[3:]:
        raise InvalidRecord("Missing frontmatter delimiters")
    header, body = text[4:].split("\n---\n", 1)
    fields = {}
    for line in header.splitlines():
        match = re.fullmatch(r"([a-z][a-z0-9_]*): (.+)", line)
        if not match:
            raise InvalidRecord("Invalid frontmatter line")
        key, value = match.groups()
        if key in fields:
            raise InvalidRecord(f"Duplicate frontmatter field: {key}")
        fields[key] = loads(value)
    return fields, body


def date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise InvalidRecord("Invalid date")
    try:
        dt.date.fromisoformat(value)
    except ValueError as exc:
        raise InvalidRecord("Impossible date") from exc


def identity(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise InvalidRecord("Invalid identity")


def string(value):
    if not isinstance(value, str) or not value.strip():
        raise InvalidRecord("Expected nonempty string")


def validate(fields, folder, stem):
    types = {"Tasks": "task", "Projects": "project", "Areas": "area",
             "Categories": "category", "Notes": "note", "Daily": "daily"}
    if fields.get("type") != types[folder]:
        raise InvalidRecord("Record type disagrees with folder")
    if folder == "Daily":
        date(fields.get("date"))
        if fields["date"] != stem or "mood" not in fields:
            raise InvalidRecord("Invalid daily date or missing mood")
        if fields["mood"] is not None and not isinstance(fields["mood"], str):
            raise InvalidRecord("Invalid mood")
        return
    identity(fields.get("id"))
    if folder != "Notes" and fields["id"] != stem:
        raise InvalidRecord("ID disagrees with filename")
    if folder in {"Projects", "Areas", "Categories"}:
        string(fields.get("name"))
        if folder == "Categories" and not re.fullmatch(r"#[0-9a-fA-F]{6}", str(fields.get("color"))):
            raise InvalidRecord("Invalid category color")
        return
    string(fields.get("title"))
    if folder == "Notes":
        title = fields["title"]
        if title != stem or title != title.strip() or title in {".", ".."} or re.search(r"[/\\\x00-\x1f\x7f]", title):
            raise InvalidRecord("Invalid note title/filename")
        return
    required = {"state", "scheduled_date", "priority", "context_id", "category_id",
                "tags", "start_time", "duration_minutes", "recurrence"}
    if not required <= fields.keys():
        raise InvalidRecord("Missing task fields")
    if fields["state"] not in {"active", "completed", "cancelled", "archived"}:
        raise InvalidRecord("Invalid task state")
    if fields["scheduled_date"] is not None:
        date(fields["scheduled_date"])
    if fields["priority"] not in {"P1", "P2", "P3", "P4"}:
        raise InvalidRecord("Invalid priority")
    for field in ("context_id", "category_id"):
        if fields[field] is not None:
            identity(fields[field])
    tags = fields["tags"]
    if not isinstance(tags, list) or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
        raise InvalidRecord("Invalid tags")
    if len(tags) != len(set(tags)):
        raise InvalidRecord("Duplicate tags")
    start = fields["start_time"]
    duration = fields["duration_minutes"]
    if start is not None and (not isinstance(start, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", start)):
        raise InvalidRecord("Invalid start time")
    if duration is not None and (type(duration) is not int or duration <= 0 or start is None):
        raise InvalidRecord("Invalid duration")
    recurrence = fields["recurrence"]
    if recurrence is not None:
        if not isinstance(recurrence, dict):
            raise InvalidRecord("Invalid recurrence")
        kind = recurrence.get("kind")
        if kind in {"daily", "weekdays"}:
            valid = set(recurrence) == {"kind"}
        elif kind == "weekly":
            days = recurrence.get("weekdays")
            valid = (set(recurrence) == {"kind", "weekdays"} and isinstance(days, list)
                     and bool(days) and all(type(day) is int and 1 <= day <= 7 for day in days)
                     and len(days) == len(set(days)))
        elif kind == "monthly":
            day = recurrence.get("day")
            valid = set(recurrence) == {"kind", "day"} and type(day) is int and 1 <= day <= 31
        else:
            valid = False
        if not valid:
            raise InvalidRecord("Invalid recurrence")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory(root):
    """Exact bytes/type snapshot; never follow symlinks."""
    root = Path(root)
    if root.is_symlink():
        raise InvalidRecord("Symlink inventory root")
    result = {}
    def visit(directory):
        for path in sorted(directory.iterdir()):
            name = path.relative_to(root).as_posix()
            if path.is_symlink():
                result[name] = {"type": "symlink", "target": str(path.readlink())}
            elif path.is_dir():
                result[name + "/"] = {"type": "directory"}
                visit(path)
            elif path.is_file():
                result[name] = {"type": "file", "sha256": digest(path.read_bytes())}
            else:
                result[name] = {"type": "unsupported"}
    visit(root)
    return result


def read_records(root):
    root = Path(root)
    if root.is_symlink():
        raise InvalidRecord("Symlink records root")
    result = {}
    for folder in ("Tasks", "Projects", "Areas", "Categories", "Notes", "Daily"):
        directory = root / folder
        if directory.is_symlink():
            raise InvalidRecord("Symlink record directory")
        if not directory.exists():
            continue
        for path in sorted(directory.iterdir()):
            if path.is_symlink() or not path.is_file() or path.suffix != ".md":
                raise InvalidRecord("Unexpected record entry")
            fields, body = decode(path.read_bytes())
            validate(fields, folder, path.stem)
            key = fields.get("id", "daily:" + fields.get("date", ""))
            if key in result:
                raise InvalidRecord("Duplicate record identity")
            result[key] = {"fields": fields, "body": body, "path": path.relative_to(root).as_posix()}
    category_names = set()
    for record in result.values():
        fields = record["fields"]
        if fields["type"] == "category":
            name = fields["name"].strip().casefold()
            if name in category_names:
                raise InvalidRecord("Duplicate category name")
            category_names.add(name)
        if fields["type"] == "task":
            for field, types in (("context_id", {"project", "area"}), ("category_id", {"category"})):
                key = fields[field]
                if key is not None and (key not in result or result[key]["fields"]["type"] not in types):
                    raise InvalidRecord("Dangling task reference")
    return result


def read_logs(root):
    logs = []
    if Path(root).is_symlink():
        raise InvalidRecord("Symlink logs root")
    directory = Path(root) / "Time Logs"
    if directory.is_symlink():
        raise InvalidRecord("Symlink log directory")
    if not directory.exists():
        return logs
    for path in sorted(directory.iterdir()):
        if path.is_symlink() or not path.is_file() or path.suffix != ".md":
            raise InvalidRecord("Unexpected log entry")
        date(path.stem)
        text = path.read_text(encoding="utf-8", errors="strict")
        blocks = re.findall(r"^```personal-os-focus\n(.*?)^```[ \t]*$", text, re.M | re.S)
        if text.count("```personal-os-focus") != len(blocks):
            raise InvalidRecord("Malformed focus block")
        for block in blocks:
            event = loads(block)
            required = {"session_id", "task_id", "date", "started_at", "finished_at", "elapsed_seconds"}
            if not isinstance(event, dict) or not required <= event.keys():
                raise InvalidRecord("Missing focus fields")
            identity(event["session_id"])
            identity(event["task_id"])
            date(event["date"])
            if event["date"] != path.stem:
                raise InvalidRecord("Focus date disagrees with filename")
            if type(event["elapsed_seconds"]) is not int or event["elapsed_seconds"] < 0:
                raise InvalidRecord("Invalid focus duration")
            times = []
            for key in ("started_at", "finished_at"):
                value = event[key]
                if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", value):
                    raise InvalidRecord("Invalid UTC timestamp")
                try:
                    times.append(dt.datetime.fromisoformat(value.replace("Z", "+00:00")))
                except ValueError as exc:
                    raise InvalidRecord("Impossible UTC timestamp") from exc
            if times[1] < times[0] or event["elapsed_seconds"] > (times[1] - times[0]).total_seconds():
                raise InvalidRecord("Impossible elapsed focus time")
            logs.append(event)
    if len({entry["session_id"] for entry in logs}) != len(logs):
        raise InvalidRecord("Duplicate focus session")
    return logs
