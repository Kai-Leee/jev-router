#!/usr/bin/env python3
"""Opt-in D071 public gate: unchanged legacy85 predicates plus description8.

The legacy entry point, registry and assertion bytes remain unchanged. This module
configures its own process before executing the shared report/command harness.
"""
import hashlib
import json

import run_public_checks as base
from extensions import description_provenance


CHECK_VERSION = "4"
ASSERTION_CONTRACT_BYTES = (base.HERE / "assertions.v2.json").read_bytes()
ASSERTION_CONTRACT_SHA256 = hashlib.sha256(ASSERTION_CONTRACT_BYTES).hexdigest()
ASSERTION_CONTRACT = json.loads(ASSERTION_CONTRACT_BYTES)
if (ASSERTION_CONTRACT.get("schema_version") != "public-assertion-contract/v1"
        or ASSERTION_CONTRACT.get("version") != "2"
        or len({item["id"] for item in ASSERTION_CONTRACT["assertions"]}) != len(ASSERTION_CONTRACT["assertions"])):
    raise ValueError("INVALID_PUBLIC_ASSERTION_CONTRACT")
for suite, ids in description_provenance.SUITES.items():
    if suite in base.SUITES or any(test_id in existing for test_id in ids for existing in base.SUITES.values()):
        raise ValueError("PUBLIC_EXTENSION_ID_COLLISION")
    base.SUITES[suite] = list(ids)
    base.RUNNERS[suite] = description_provenance.RUNNERS[suite]
base.CHECK_VERSION = CHECK_VERSION
base.ASSERTION_CONTRACT_BYTES = ASSERTION_CONTRACT_BYTES
base.ASSERTION_CONTRACT_SHA256 = ASSERTION_CONTRACT_SHA256
base.ASSERTION_CONTRACT = ASSERTION_CONTRACT
SUITES, RUNNERS, Checks, Harness = base.SUITES, base.RUNNERS, base.Checks, base.Harness


if __name__ == "__main__":
    raise SystemExit(base.main())
