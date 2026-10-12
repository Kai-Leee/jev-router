"""D071 public request-body description checks; no hidden grader dependency.

Two public fixture variants distinguish requestBody.description from its schema's
description. Each endpoint function is a separate case and stable assertion. The
source docstring is diagnostic evidence; the acceptance predicate checks the
imported public callable, as the original R10.02 check does.
"""
from __future__ import annotations

import ast
import copy
import hashlib
import importlib
import inspect
import json
from pathlib import Path
import re


HERE = Path(__file__).resolve().parents[1]
FUNCTIONS = ("sync", "sync_detailed", "asyncio", "asyncio_detailed")
SCENARIOS = (
    ("distinct", "Request-level body text.", "Schema-level model text."),
    ("request-only", "Request-only body text.", None),
)
SUITES = {"description-provenance": [
    f"T.R10.02.body-description.{scenario}.{function}"
    for scenario, _, _ in SCENARIOS for function in FUNCTIONS
]}
REQUEST_POINTER = "/paths/~1widgets~1{itemId}/post/requestBody/description"
SCHEMA_POINTER = "/paths/~1widgets~1{itemId}/post/requestBody/content/application~1json/schema/description"


def body_entries(docstring):
    """Read body entries only inside Args, preserving empty descriptions."""
    lines = []
    in_args = False
    for line in (docstring or "").splitlines():
        stripped = line.strip()
        if re.fullmatch(r"[A-Za-z]+:", stripped):
            in_args = stripped == "Args:"
        elif in_args and re.match(r"body\s*\(", stripped):
            lines.append(stripped)
    descriptions = []
    for line in lines:
        match = re.fullmatch(r"body\s+\(.+\):(?:\s+(.*))?", line)
        descriptions.append((match.group(1) or "") if match else None)
    return {"body_lines": lines, "body_descriptions": descriptions}


def _observation(actual, expected, model_text):
    if actual == [expected]:
        return "request_description_preserved"
    if len(actual) != 1:
        return "missing_or_ambiguous_body_entry"
    if actual[0] in (None, ""):
        return "missing_body_description"
    if model_text is not None and actual[0] == model_text:
        return "schema_description_substitution"
    return "other_description_mismatch"


def description_provenance_checks(h, c):
    fixture_bytes = (HERE / "fixtures" / "d065-models.json").read_bytes()
    fixture = json.loads(fixture_bytes)
    for scenario, expected, model_text in SCENARIOS:
        wanted_ids = [f"T.R10.02.body-description.{scenario}.{name}" for name in FUNCTIONS]
        if c.selected_ids is not None and not any(test_id in c.selected_ids for test_id in wanted_ids):
            continue
        spec = copy.deepcopy(fixture)
        body = spec["paths"]["/widgets/{itemId}"]["post"]["requestBody"]
        body["description"] = expected
        schema = body["content"]["application/json"]["schema"]
        if model_text is None:
            schema.pop("description", None)
        else:
            schema["description"] = model_text
        # Hash the exact JSON bytes Harness.write_document writes for this request.
        input_bytes = json.dumps(spec).encode("utf-8")
        package, directory = h.generate_spec(spec, "generated_d071_" + scenario.replace("-", "_"))
        module = importlib.import_module(package.__name__ + ".api.widgets.upload_thing")
        source_path = directory / "api" / "widgets" / "upload_thing.py"
        source_bytes = source_path.read_bytes()
        declarations = [node for node in ast.parse(source_bytes).body
                        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
        for function in FUNCTIONS:
            test_id = f"T.R10.02.body-description.{scenario}.{function}"
            assertion_id = "A" + test_id[1:]

            def check(function=function, assertion_id=assertion_id):
                function_value = getattr(module, function)
                runtime = body_entries(inspect.getdoc(function_value))
                source_nodes = [node for node in declarations if node.name == function]
                source = body_entries(ast.get_docstring(source_nodes[0])) if len(source_nodes) == 1 else None
                c.active["description_provenance"] = {
                    "schema_version": "public-description-provenance/v1",
                    "scenario": scenario, "function": function,
                    "base_fixture_sha256": hashlib.sha256(fixture_bytes).hexdigest(),
                    "input_sha256": hashlib.sha256(input_bytes).hexdigest(),
                    "request_description_pointer": REQUEST_POINTER,
                    "schema_description_pointer": SCHEMA_POINTER,
                    "expected_request_description": expected,
                    "schema_description_present": model_text is not None,
                    "schema_description": model_text,
                    "generated_endpoint_path": "api/widgets/upload_thing.py",
                    "generated_endpoint_sha256": hashlib.sha256(source_bytes).hexdigest(),
                    "runtime": runtime, "source": source,
                    "source_function_count": len(source_nodes),
                    "observation": _observation(runtime["body_descriptions"], expected, model_text),
                    "attribution_basis": "description_value_observation_not_fault_owner_proof",
                }
                c.equal(runtime["body_descriptions"], [expected],
                        f"{scenario}/{function}: body Args uses requestBody.description, not schema.description",
                        assertion_id=assertion_id)

            c.case(test_id, check)


RUNNERS = {"description-provenance": description_provenance_checks}
