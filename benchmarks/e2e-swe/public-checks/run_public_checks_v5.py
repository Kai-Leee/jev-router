#!/usr/bin/env python3
"""D095 opt-in strengthened public gate: same93 case IDs, new predicates."""
import hashlib
import json
import run_public_checks_v4 as prior
from extensions.schema_boundaries import strengthen

base = prior.base
contract = (base.HERE / "assertions.v3.json").read_bytes()
base.ASSERTION_CONTRACT = json.loads(contract)
if base.ASSERTION_CONTRACT["version"] != "3":
    raise ValueError("INVALID_PUBLIC_ASSERTION_CONTRACT")
base.ASSERTION_CONTRACT_BYTES = contract
base.ASSERTION_CONTRACT_SHA256 = hashlib.sha256(contract).hexdigest()
base.CHECK_VERSION = "5"
strengthen(base)
if __name__ == "__main__":
    raise SystemExit(base.main())
