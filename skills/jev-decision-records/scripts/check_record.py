#!/usr/bin/env python3
"""Check document evidence references; deliberately not a claim-truth evaluator."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys


def validate(record_path, root):
    root = root.resolve(strict=True)
    body = record_path.read_text(encoding="utf-8")
    blocks = re.findall(r"^```decision-record\s*\n(.*?)^```\s*$", body, re.M | re.S)
    if len(blocks) != 1:
        raise ValueError("Expected exactly one decision-record JSON block")
    doc = json.loads(blocks[0])
    if not isinstance(doc, dict):
        raise ValueError("Record must be an object")
    for key in ("id", "goal", "owner", "next_trigger"):
        if not isinstance(doc.get(key), str) or not doc[key].strip():
            raise ValueError(f"Missing nonempty {key}")
    if doc.get("status") not in {"planned", "running", "complete", "blocked"}:
        raise ValueError("Invalid status")
    for key in ("conditions", "unresolved", "side_effects"):
        if not isinstance(doc.get(key), list) or any(not isinstance(x, str) or not x.strip() for x in doc[key]):
            raise ValueError(f"{key} must be an array of nonempty strings")
    if not doc["conditions"]:
        raise ValueError("conditions must not be empty")
    for key in ("sources", "claims", "costs"):
        if not isinstance(doc.get(key), list) or any(not isinstance(x, dict) for x in doc[key]):
            raise ValueError(f"{key} must be an array of objects")
    sources = set()
    for source in doc["sources"]:
        sid, path, expected = source.get("id"), source.get("path"), source.get("sha256")
        if not isinstance(sid, str) or not sid.strip() or sid in sources:
            raise ValueError("Source IDs must be nonempty and unique")
        if not isinstance(path, str) or not path or Path(path).is_absolute():
            raise ValueError(f"Source {sid} must have a repository-relative path")
        target = (root / path).resolve(strict=True)
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError(f"Source {sid} is not a file inside root")
        if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError(f"Source {sid} lacks SHA-256")
        if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Source {sid} hash mismatch")
        sources.add(sid)

    def refs(item, needed):
        ids = item.get("source_ids")
        if not isinstance(ids, list) or any(not isinstance(x, str) or x not in sources for x in ids):
            raise ValueError("Unknown or malformed source_ids")
        if needed and not ids:
            raise ValueError("Measured/estimated/corrected or numeric cost claim lacks evidence")

    claims = set()
    for claim in doc["claims"]:
        cid = claim.get("id")
        if not isinstance(cid, str) or not cid.strip() or cid in claims:
            raise ValueError("Claim IDs must be nonempty and unique")
        claims.add(cid)
        kind = claim.get("kind")
        if kind not in {"decision", "hypothesis", "measured", "estimate", "correction", "unknown"}:
            raise ValueError(f"Invalid claim kind for {cid}")
        if not isinstance(claim.get("text"), str) or not claim["text"].strip():
            raise ValueError(f"Missing text for {cid}")
        refs(claim, kind in {"measured", "estimate", "correction"})
    for cost in doc["costs"]:
        if not isinstance(cost.get("role"), str) or not cost["role"].strip():
            raise ValueError("Cost requires role")
        basis = cost.get("basis")
        if basis not in {"actual_billing", "api_equivalent", "monthly_allocation", "conservative_budget", "unknown"}:
            raise ValueError("Invalid cost basis")
        if "usd" not in cost:
            raise ValueError("Cost requires usd, including explicit null when unknown")
        usd = cost["usd"]
        if usd is not None and (type(usd) not in (int, float) or not math.isfinite(usd) or usd < 0):
            raise ValueError("Cost must be finite nonnegative number or null")
        if basis == "unknown" and usd is not None:
            raise ValueError("Unknown cost must remain null")
        refs(cost, usd is not None)
    return {"id": doc["id"], "status": doc["status"], "sources_checked": len(sources), "claims_checked": len(claims), "semantic_support_checked": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.record, args.root)))
    except (ValueError, OSError, TypeError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        sys.exit(1)
