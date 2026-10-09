#!/usr/bin/env python3
"""Deliberately false success: grader negative control, not an app adapter."""
import json
import sys

json.load(sys.stdin)
json.dump({"status": "ok", "result": {}}, sys.stdout)
sys.stdout.write("\n")
