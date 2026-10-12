#!/usr/bin/env python3
"""Public-instruction acceptance checks; never imports a hidden grader.

Run real candidates inside an externally isolated, dependency-prepared environment.
This runner supplies temporary output directories and subprocess timeouts, not an OS
sandbox. The bundled normal/defective generators are deliberately partial controls.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime
import hashlib
import importlib
import importlib.util
import inspect
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid
from collections import UserDict
from http import HTTPStatus


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CHECK_VERSION = "3"
ASSERTION_CONTRACT_BYTES = (HERE / "assertions.json").read_bytes()
ASSERTION_CONTRACT_SHA256 = hashlib.sha256(ASSERTION_CONTRACT_BYTES).hexdigest()
ASSERTION_CONTRACT = json.loads(ASSERTION_CONTRACT_BYTES)
if (ASSERTION_CONTRACT.get("schema_version") != "public-assertion-contract/v1"
        or ASSERTION_CONTRACT.get("version") != "1"
        or len({item["id"] for item in ASSERTION_CONTRACT["assertions"]}) != len(ASSERTION_CONTRACT["assertions"])):
    raise ValueError("INVALID_PUBLIC_ASSERTION_CONTRACT")
SUITES = {
    "runtime-model-core": [
        "T.R04.04", "T.R04.05", "T.R06.01", "T.R06.02", "T.R06.03",
        "T.R07.01", "T.R07.02", "T.R07.03", "T.R07.04", "T.R08.01",
        "T.R08.02", "T.R08.03", "T.R08.04", "T.R09.02", "T.R10.01",
    ],
    "enums-defaults": [
        "T.R11.01", "T.R11.02", "T.R11.03", "T.R11.04", "T.R11.06",
        "T.R14.01", "T.R14.02", "T.R14.03", "T.R14.04", "T.integration.defaults",
    ],
    "cli-layout": ["T.R03.02", "T.R03.04", "T.R04.01", "T.R04.02", "T.R04.03", "T.R18.03"],
    "diagnostics": ["T.R03.05", "T.R19.01", "T.R19.02", "T.R19.04", "T.R19.05"],
}


class Checks:
    def __init__(self, selected_ids=None):
        self.cases = []
        self.active = None
        self.selected_ids = selected_ids

    def _record_assertion(self, assertion_id, passed):
        if assertion_id is None:
            return
        result = next((item for item in self.active.get("assertion_results", [])
                       if item["assertion_id"] == assertion_id), None)
        if result is None or result["status"] != "not_reached":
            raise ValueError("INVALID_PUBLIC_ASSERTION_EXECUTION")
        result["status"] = "passed" if passed else "failed"
        if not passed:
            self.active["failed_assertion_id"] = assertion_id

    def require(self, condition, message, *, assertion_id=None):
        self.active["assertions"] += 1
        passed = bool(condition)
        self._record_assertion(assertion_id, passed)
        if not passed:
            raise AssertionError(message)

    def equal(self, actual, expected, message, *, assertion_id=None):
        self.require(actual == expected, f"{message}: expected {expected!r}, got {actual!r}", assertion_id=assertion_id)

    def raises(self, exception_type, call, message):
        self.active["assertions"] += 1
        try:
            call()
        except exception_type:
            return
        except Exception as exc:
            raise AssertionError(f"{message}: got {type(exc).__name__}") from exc
        raise AssertionError(f"{message}: no exception")

    def case(self, test_id, function):
        if self.selected_ids is not None and test_id not in self.selected_ids:
            return
        self.active = {"test_id": test_id, "status": "passed", "assertions": 0}
        declared = [item for item in ASSERTION_CONTRACT["assertions"] if item["test_id"] == test_id]
        if declared:
            # Declaring an assertion never increments the executed count. A
            # preceding exception leaves later assertions explicitly not reached.
            self.active["assertion_results"] = [{"assertion_id": item["id"], "status": "not_reached"}
                                                for item in declared]
        try:
            function()
            if self.active["assertions"] == 0:
                raise AssertionError("case must contain substantive assertions")
        except subprocess.TimeoutExpired:
            raise
        except Exception as exc:
            self.active.update(status="failed", error_type=type(exc).__name__, message=str(exc))
        self.cases.append(self.active)
        self.active = None


def annotation_members(value):
    """Union order is explicitly immaterial in the public instruction."""
    if not isinstance(value, str):
        return set()
    return {part.strip() for part in value.split("|")}


class Harness:
    def __init__(self, binding, scratch):
        if not isinstance(binding, dict) or binding.get("schema_version") not in ("dag-public-command/v1", "dag-public-command/v2"):
            raise ValueError("INVALID_COMMAND_BINDING")
        self.binding = dict(binding)
        self.scratch = Path(scratch).resolve()
        self.install_receipt = None
        self.installed_command = None
        self.installed_environment = None
        self.installed_root = None
        self.environment_evidence = {}
        self.count = 0
        self.invocations = []
        command = binding.get("command", ["pyclientgen"] if binding.get("kind") == "candidate" else None)
        if not isinstance(command, list) or not command or any(not isinstance(x, str) or not x for x in command):
            raise ValueError("INVALID_COMMAND_BINDING")
        self.command = list(command)
        for index in binding.get("repository_path_arguments", []):
            if not isinstance(index, int) or index < 0 or index >= len(self.command):
                raise ValueError("INVALID_COMMAND_BINDING")
            candidate = (ROOT / self.command[index]).resolve()
            if not candidate.is_relative_to(ROOT):
                raise ValueError("COMMAND_PATH_ESCAPES_REPOSITORY")
            self.command[index] = str(candidate)
        # No inherited provider keys, PYTHONPATH, user startup options, or shell.
        self.environment = {
            "PATH": os.environ.get("PATH", os.defpath),
            "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1",
            "PIP_NO_INDEX": "1", "PIP_DISABLE_PIP_VERSION_CHECK": "1",
        }
        if binding.get("schema_version") == "dag-public-command/v2" and binding.get("kind") == "candidate":
            self.install_candidate()
            self.command = self.installed_command
            self.environment = self.installed_environment

    def install_candidate(self):
        """Actually install a fresh source copy with preinstalled dependencies.

        The containing Docker runtime supplies network isolation. The checker does
        not interpret a binding's isolation string as evidence of that isolation.
        """
        if self.install_receipt is not None:
            if self.install_receipt["exit_code"] != 0:
                raise AssertionError("candidate setup previously failed")
            return self.install_receipt
        source = self.binding.get("candidate_root")
        if source is None:
            raise ValueError("CANDIDATE_ROOT_REQUIRED_FOR_SETUP_CHECK")
        source = Path(source)
        if not source.is_absolute():
            source = ROOT / source
        source = source.resolve(strict=True)
        for path in source.rglob("*"):
            if path.is_symlink():
                raise ValueError("CANDIDATE_SETUP_SOURCE_CONTAINS_SYMLINK")
        copied = self.scratch / "installed_candidate"
        shutil.copytree(source, copied, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git", ".venv", "node_modules"))
        overlay = self.binding.get("control_setup_overlay")
        if overlay:
            if self.binding.get("kind") not in ("authored_local_control", "authored_defective_local_control"):
                raise ValueError("CANDIDATE_CANNOT_USE_CONTROL_SETUP_OVERLAY")
            overlay_path = (source / overlay).resolve(strict=True)
            if not overlay_path.is_relative_to(source):
                raise ValueError("CONTROL_OVERLAY_ESCAPES_SOURCE")
            shutil.copytree(overlay_path, copied, dirs_exist_ok=True)
        defect = self.command[self.command.index("--defect") + 1] if "--defect" in self.command else "none"
        if self.binding.get("kind") in ("authored_local_control", "authored_defective_local_control"):
            if defect == "cli_dependency_undeclared":
                metadata = copied / "pyproject.toml"
                metadata.write_text(metadata.read_text().replace(', "ruamel.yaml"', ''), encoding="utf-8")
            elif defect == "cli_setup_missing_flag":
                script = copied / "setup.sh"
                script.write_text(script.read_text().replace(" --no-build-isolation", ""), encoding="utf-8")
            elif defect == "cli_entrypoint_missing":
                metadata = copied / "pyproject.toml"
                metadata.write_text(metadata.read_text().replace('pyclientgen = "pyclientgen.cli:main"', 'wrongcommand = "pyclientgen.cli:main"'), encoding="utf-8")
            elif defect == "cli_requires_download":
                script = copied / "setup.sh"
                script.write_text(script.read_text() + "\npip install d065-unavailable-public-control-package==7826\n", encoding="utf-8")
            elif defect == "cli_valid_editable_equals":
                script = copied / "setup.sh"
                script.write_text(script.read_text().replace("-e .", "--editable=."), encoding="utf-8")
        venv = self.scratch / "candidate_venv"
        created = subprocess.run([sys.executable, "-m", "venv", "--system-site-packages", str(venv)],
                                 env=self.environment, capture_output=True, text=True, timeout=60)
        if created.returncode != 0:
            raise AssertionError("isolated venv creation failed: " + created.stderr[-1200:])
        environment = dict(self.environment)
        environment["PATH"] = str(venv / "bin") + os.pathsep + environment["PATH"]
        environment["VIRTUAL_ENV"] = str(venv)
        environment["PIP_NO_BUILD_ISOLATION"] = "1"
        environment["PYTHONPATH"] = str(HERE / "instrumentation")
        trace = self.scratch / "candidate-execution-trace.jsonl"
        environment["PUBLIC_CHECK_TRACE_PATH"] = str(trace)
        identity = subprocess.run([str(venv / "bin" / "python"), "-c", "import json,sys,sysconfig,shutil; print(json.dumps({'prefix':sys.prefix,'executable':sys.executable,'purelib':sysconfig.get_path('purelib'),'pip_command':shutil.which('pip')}))"],
                                  env=environment, capture_output=True, text=True, timeout=20)
        setup = subprocess.run(["bash", "setup.sh"], cwd=copied, env=environment,
                               capture_output=True, text=True, timeout=120)
        script = venv / "bin" / "pyclientgen"
        self.install_receipt = {"exit_code": setup.returncode, "stdout": setup.stdout[-6000:], "stderr": setup.stderr[-6000:],
                                "venv": str(venv), "source_root": str(copied), "trace_path": str(trace),
                                "python": str(venv / "bin" / "python"), "console_script": str(script),
                                "interpreter_identity": json.loads(identity.stdout) if identity.returncode == 0 else {"error": identity.stderr},
                                "console_script_exists": script.is_file()}
        self.installed_root = copied
        self.installed_environment = environment
        self.installed_command = [str(script)]
        if self.binding.get("kind") in ("authored_local_control", "authored_defective_local_control"):
            self.installed_command += ["--defect", defect]
        if setup.returncode != 0 or not script.is_file():
            raise AssertionError("offline setup did not install pyclientgen: " + setup.stdout[-1200:] + setup.stderr[-1200:])
        return self.install_receipt

    def run(self, arguments, *, cwd=None, installed=False, timeout=20):
        self.count += 1
        directory = self.scratch / f"call_{self.count}" if cwd is None else Path(cwd)
        directory.mkdir(parents=True, exist_ok=True)
        if installed:
            self.install_candidate()
        command = self.installed_command if installed else self.command
        environment = self.installed_environment if installed else self.environment
        result = subprocess.run(command + list(arguments), cwd=directory, env=environment, capture_output=True, text=True, timeout=timeout)
        self.invocations.append({"number": self.count, "exit_code": result.returncode, "installed_cli": installed or self.binding.get("kind") == "candidate"})
        return directory, result

    def invoke(self, spec, *options, cwd=None, config=None, suffix=".json", config_suffix=".json", installed=False):
        directory = self.scratch / f"call_{self.count + 1}" if cwd is None else Path(cwd)
        directory.mkdir(parents=True, exist_ok=True)
        source = directory / f"input_{self.count + 1}{suffix}"
        self.write_document(source, spec)
        arguments = ["generate", "--path", str(source)]
        if config is not False:
            config_path = directory / f"config_{self.count + 1}{config_suffix}"
            self.write_document(config_path, {"post_hooks": []} if config is None else config)
            arguments += ["--config", str(config_path)]
        return self.run(arguments + list(options), cwd=directory, installed=installed)

    @staticmethod
    def write_document(path, document):
        if path.suffix == ".json":
            path.write_text(json.dumps(document), encoding="utf-8")
        else:
            from ruamel.yaml import YAML
            with path.open("w", encoding="utf-8") as stream:
                YAML().dump(document, stream)

    def generate(self, fixture, name, config=None, extra_args=None):
        spec = json.loads((HERE / "fixtures" / fixture).read_text(encoding="utf-8"))
        return self.generate_spec(spec, name, config=config, extra_args=extra_args)

    def generate_spec(self, spec, name, config=None, extra_args=None):
        output = self.scratch / name
        _, result = self.invoke(spec, "--meta", "none", "--output-path", str(output), *(extra_args or []), config=config)
        if result.returncode != 0:
            raise AssertionError(f"valid public fixture generation failed: {result.stdout[-1000:]} {result.stderr[-1000:]}")
        if not (output / "__init__.py").is_file():
            raise AssertionError("generator did not emit an importable package at the specified output path")
        sys.path.insert(0, str(self.scratch))
        importlib.invalidate_caches()
        module = importlib.import_module(name)
        if Path(module.__file__).resolve() != output / "__init__.py":
            raise AssertionError("import resolved outside the fresh generated package")
        return module, output


def core_checks(h, c):
    pkg, directory = h.generate("runtime-model-core.json", "generated_core")
    module = lambda suffix: importlib.import_module(pkg.__name__ + suffix)
    models = module(".models")
    types = module(".types")

    def runtime_layout():
        for path in ("__init__.py", "types.py", "client.py", "errors.py"):
            c.require((directory / path).is_file(), f"missing runtime module {path}")
        c.require(inspect.isclass(module(".client").Client), "Client is a class")
        c.require(inspect.isclass(module(".client").AuthenticatedClient), "AuthenticatedClient is a class")
        c.require(issubclass(module(".errors").UnexpectedStatus, Exception), "UnexpectedStatus is an exception")

    def model_exports():
        for class_name, file_name in (("Probe", "probe"), ("ScalarProbe", "scalar_probe"),
                                     ("FormatProbe", "format_probe"), ("Child", "child"),
                                     ("CollectionsProbe", "collections_probe"), ("Status", "status")):
            c.require((directory / "models" / (file_name + ".py")).is_file(), f"schema module {file_name}")
            c.require(getattr(models, class_name) is getattr(module(".models." + file_name), class_name),
                      f"models re-exports {class_name}")

    def unset():
        c.require(isinstance(types.UNSET, types.Unset), "UNSET is an Unset instance")
        c.require(not bool(types.Unset()) and not bool(types.UNSET), "Unset instances and singleton are falsy")
        c.require(models.Probe(title="one").note is types.UNSET, "absent optional value is exact exported UNSET")

    def file_value():
        stream = io.BytesIO(b"public fixture bytes")
        value = types.File(payload=stream, file_name="sample.bin", mime_type="application/octet-stream")
        c.equal(value.to_tuple(), ("sample.bin", stream, "application/octet-stream"), "File tuple order")
        c.require(value.to_tuple()[1] is stream, "File stream identity")
        c.equal(value, types.File(payload=stream, file_name="sample.bin", mime_type="application/octet-stream"), "File value equality")
        c.equal(types.File(payload=stream, file_name=None, mime_type=None).to_tuple(), (None, stream, None), "None metadata preserved")

    def response():
        value = types.Response[dict](status_code=HTTPStatus.ACCEPTED, content=b"raw", headers={"x-check": "yes"}, parsed={"value": 4})
        for name, expected in (("status_code", HTTPStatus.ACCEPTED), ("content", b"raw"),
                               ("headers", {"x-check": "yes"}), ("parsed", {"value": 4})):
            c.equal(getattr(value, name), expected, f"Response.{name}")

    def constructor():
        params = inspect.signature(models.Probe).parameters
        c.require(params["title"].default is inspect.Parameter.empty, "required title has no default")
        c.require(params["note"].default is types.UNSET, "optional note defaults to UNSET")
        c.require("additional_properties" not in params, "additional properties are not constructor parameters")
        c.raises(TypeError, lambda: models.Probe(), "required constructor argument")
        c.equal(models.Probe(title="same", note="equal"), models.Probe(title="same", note="equal"), "model equality")
        c.require(models.Probe(title="different") != models.Probe(title="same"), "model values distinguish inequality")

    def serialization():
        c.equal(models.Probe(title="one").to_dict(), {"title": "one"}, "UNSET omitted")
        c.equal(models.Probe(title="one", note="two", string_prop="three").to_dict(),
                {"title": "one", "note": "two", "stringProp": "three"}, "original JSON key preserved")

    def parsing():
        parsed = models.Probe.from_dict(UserDict({"title": "mapping", "stringProp": "raw"}))
        c.require(isinstance(parsed, models.Probe), "from_dict returns requested class")
        c.equal((parsed.title, parsed.string_prop), ("mapping", "raw"), "Mapping parsing")
        c.raises(KeyError, lambda: models.Probe.from_dict({"note": "missing title"}), "missing required property")
        c.raises(Exception, lambda: models.Probe.from_dict(17), "non-mapping input")

    def annotations():
        ann = models.Probe.__annotations__
        for name in ("title", "note", "string_prop"):
            c.require(isinstance(ann.get(name), str), f"class-level string annotation {name}")
        c.equal(annotation_members(ann["title"]), {"str"}, "required annotation")
        for name in ("note", "string_prop"):
            c.equal(annotation_members(ann[name]), {"str", "Unset"}, f"optional annotation {name}")

    def scalars():
        data = {"enabled": True, "text": "public", "count": 7, "amount": 2.25, "nothing": None,
                "anything": {"nested": [1, False, None]}}
        value = models.ScalarProbe.from_dict(data)
        c.equal(value.to_dict(), data, "scalar/null/unconstrained round trip")
        for name, annotation, typ in (("enabled", "bool", bool), ("text", "str", str), ("count", "int", int),
                                      ("amount", "float", float), ("nothing", "None", type(None))):
            c.equal(models.ScalarProbe.__annotations__[name], annotation, f"{name} annotation")
            c.require(type(getattr(value, name)) is typ, f"{name} value type")
        c.equal(models.ScalarProbe.__annotations__["anything"], "Any", "unconstrained Any annotation")

    def formats():
        data = {"day": "2020-01-02", "moment": "2020-01-02T03:04:05", "identifier": "12345678-1234-5678-1234-567812345678", "unknown": "verbatim"}
        value = models.FormatProbe.from_dict(data)
        expected = (("day", datetime.date(2020, 1, 2), {"datetime.date", "date"}),
                    ("moment", datetime.datetime(2020, 1, 2, 3, 4, 5), {"datetime.datetime", "datetime"}),
                    ("identifier", uuid.UUID(data["identifier"]), {"UUID", "uuid.UUID"}), ("unknown", "verbatim", {"str"}))
        for name, wanted, annotations in expected:
            c.require(type(getattr(value, name)) is type(wanted), f"formatted {name} Python type")
            c.equal(getattr(value, name), wanted, f"formatted {name} value")
            c.require(models.FormatProbe.__annotations__[name] in annotations, f"formatted {name} annotation")
        c.equal(value.to_dict(), data, "formatted round trip")

    collection_data = {"child": {"childName": "nested"}, "records": [{"childName": "a"}, {"childName": "b"}], "values": [1, "x", {"v": 2}]}

    def nested():
        value = models.CollectionsProbe.from_dict(collection_data)
        c.require(isinstance(value.child, models.Child), "reference decodes to model")
        c.equal(value.child.child_name, "nested", "nested value")
        c.equal(models.CollectionsProbe.__annotations__["child"], "Child", "object reference annotation")
        c.equal(value.to_dict()["child"], collection_data["child"], "nested model serialization")

    def arrays():
        value = models.CollectionsProbe.from_dict(collection_data)
        c.require(all(isinstance(item, models.Child) for item in value.records), "array object conversion")
        c.equal([item.child_name for item in value.records], ["a", "b"], "array object values")
        c.equal(models.CollectionsProbe.__annotations__["records"].replace(" ", ""), "list[Child]", "typed array annotation")
        c.equal(models.CollectionsProbe.__annotations__["values"].replace(" ", ""), "list[Any]", "unconstrained array annotation")
        c.equal(value.values, collection_data["values"], "unconstrained elements preserved")
        c.equal(value.to_dict(), collection_data, "array round trip")

    def additional():
        value = models.Probe.from_dict({"title": "known", "extra": 3, "other": {"x": 1}})
        c.equal(value.additional_properties, {"extra": 3, "other": {"x": 1}}, "unknown fields routed to additional_properties")
        c.equal(value["extra"], 3, "additional lookup")
        value["new"] = [4]
        c.require("new" in value and "absent" not in value, "additional membership")
        c.equal(set(value.additional_keys), {"extra", "other", "new"}, "additional_keys")
        c.equal(value.to_dict(), {"title": "known", "extra": 3, "other": {"x": 1}, "new": [4]}, "additional serialization")

    def docstring():
        doc = inspect.cleandoc(models.Probe.__doc__ or "")
        c.require(doc.startswith("A public model fixture."), "model description leads")
        c.require("\n\nAttributes:\n" in doc, "blank line before Google Attributes section")
        lines = [line.strip() for line in doc.splitlines()]
        for name, description in (("title", "A required title."), ("note", ""), ("string_prop", "A JSON name.")):
            expected = f"{name} ({models.Probe.__annotations__[name]}):" + (f" {description}" if description else "")
            c.require(expected in lines, f"docstring exact property entry {name}")

    for test_id, case in zip(SUITES["runtime-model-core"],
                             (runtime_layout, model_exports, unset, file_value, response, constructor, serialization,
                              parsing, annotations, scalars, formats, nested, arrays, additional, docstring)):
        c.case(test_id, case)


def enum_default_checks(h, c):
    pkg, _ = h.generate("enums-defaults.json", "generated_defaults")
    m = importlib.import_module(pkg.__name__ + ".models")
    types = importlib.import_module(pkg.__name__ + ".types")

    def enum_values():
        for enum, value, invalid in ((m.Color, "a", "not_a_color"), (m.Number, -4, 99)):
            c.equal(enum(value).value, value, "valid enum value")
            c.raises(ValueError, lambda: enum(invalid), "invalid enum value")
        parsed = m.EnumProbe.from_dict({"color": "a", "number": -4, "marker": "fixed"})
        c.require(isinstance(parsed.color, m.Color) and isinstance(parsed.number, m.Number), "model carries enum members")
        c.equal(parsed.to_dict(), {"color": "a", "number": -4, "marker": "fixed"}, "enum raw values serialized")

    def string_names():
        for name, value in (("A", "a"), ("B", "B"), ("A23", "a23"), ("VALUE_3", "123"),
                            ("VALUE_6", ""), ("A_THING_WITH_SPACES", "a Thing WIth spaces")):
            c.equal(getattr(m.Color, name).value, value, f"string enum member {name}")

    def integer_names():
        c.equal(m.Number.VALUE_2.value, 2, "positive integer enum name")
        c.equal(m.Number.VALUE_NEGATIVE_4.value, -4, "negative integer enum name")

    def varnames():
        for name, value in (("ONE", 1), ("MORE_THAN_ON_E", 2), ("NOT_QUITE_FOUR", 3), ("NEGATIVE_FOUR", 4)):
            c.equal(getattr(m.CustomNumber, name).value, value, f"x-enum-varnames {name}")

    def const():
        c.equal(m.EnumProbe.from_dict({"color": "a", "number": 2, "marker": "fixed"}).marker, "fixed", "valid constant")
        c.raises(ValueError, lambda: m.EnumProbe.from_dict({"color": "a", "number": 2, "marker": "other"}), "invalid constant")

    def format_defaults():
        value = m.Defaults()
        for name, expected in (("day", datetime.date(2020, 1, 2)), ("moment", datetime.datetime(2020, 1, 2, 3, 4, 5)),
                               ("identifier", uuid.UUID("12345678-1234-5678-1234-567812345678"))):
            c.require(type(getattr(value, name)) is type(expected), f"default {name} Python type")
            c.equal(getattr(value, name), expected, f"default {name} value")

    def numeric_defaults():
        value = m.Defaults()
        c.require(type(value.count) is int and type(value.amount) is float, "numeric string defaults converted")
        c.equal((value.count, value.amount), (4, 5.5), "numeric defaults")

    def boolean_defaults():
        value = m.Defaults()
        for name, expected in (("upper_true", True), ("lower_true", True), ("upper_false", False), ("lower_false", False)):
            c.require(type(getattr(value, name)) is bool, f"default {name} is bool")
            c.equal(getattr(value, name), expected, f"default {name} value")

    def enum_default():
        value = m.Defaults()
        c.require(isinstance(value.color, m.Color), "allOf enum default converted to enum")
        c.equal(value.color.value, "a", "allOf enum default value")
        c.equal(value.to_dict()["color"], "a", "allOf enum default serialized")

    def integrated_defaults():
        format_defaults()
        numeric_defaults()
        boolean_defaults()
        enum_default()
        value = m.Defaults()
        c.require(value.absent is types.UNSET, "unrelated absent optional remains UNSET")
        for name in ("day", "moment", "identifier", "count", "amount", "upper_true", "lower_true", "upper_false", "lower_false", "color", "absent"):
            c.require(isinstance(m.Defaults.__annotations__.get(name), str), f"default model string annotation {name}")
        c.equal(value.to_dict(), {"day": "2020-01-02", "moment": "2020-01-02T03:04:05",
                                "identifier": "12345678-1234-5678-1234-567812345678", "count": 4, "amount": 5.5,
                                "upperTrue": True, "lowerTrue": True, "upperFalse": False, "lowerFalse": False, "color": "a"},
                "combined defaults JSON serialization omits UNSET")

    for test_id, case in zip(SUITES["enums-defaults"], (enum_values, string_names, integer_names, varnames, const,
                                                     format_defaults, numeric_defaults, boolean_defaults, enum_default, integrated_defaults)):
        c.case(test_id, case)


def simple_spec():
    return {"openapi": "3.1.0", "info": {"title": "My Cool API", "version": "1.2.3"}, "paths": {}}


def layout_checks(h, c):
    # Each mode/path combination is generated once, then independent ID assertions
    # inspect exactly the parts of its public contract they claim to cover.
    outputs = {}
    for mode in ("none", "poetry", "setup", "pdm", "uv", "omitted"):
        for explicit in (False, True):
            destination = h.scratch / f"explicit_{mode}" if explicit else None
            args = [] if mode == "omitted" else ["--meta", mode]
            if explicit:
                args += ["--output-path", str(destination)]
            cwd, result = h.invoke(simple_spec(), *args)
            directory = destination or cwd / ("my_cool_api_client" if mode == "none" else "my-cool-api-client")
            outputs[mode, explicit] = (directory, result)

    def options():
        for (mode, explicit), (directory, result) in outputs.items():
            c.equal(result.returncode, 0, f"metadata {mode}, explicit={explicit} accepted")
            c.require(directory.is_dir(), f"selected output location used: {mode}/{explicit}")
            if mode == "omitted":
                c.require((directory / "pyproject.toml").is_file(), "omitted meta emits poetry metadata")
                c.require((directory / "README.md").is_file(), "omitted meta emits poetry README")

    def overwrite():
        destination = h.scratch / "overwrite_target"
        destination.mkdir()
        (destination / "existing.txt").write_text("pre-existing fixture", encoding="utf-8")
        _, refused = h.invoke(simple_spec(), "--meta", "none", "--output-path", str(destination))
        c.require(refused.returncode != 0, "existing output without overwrite is an error")
        _, accepted = h.invoke(simple_spec(), "--meta", "none", "--output-path", str(destination), "--overwrite")
        c.equal(accepted.returncode, 0, "explicit overwrite succeeds")
        c.require((destination / "types.py").is_file(), "overwrite actually emits package")

    def names():
        directory, result = outputs["poetry", False]
        c.equal(result.returncode, 0, "naming fixture generation")
        c.equal(directory.name, "my-cool-api-client", "project name derives from title")
        c.require((directory / "my_cool_api_client" / "__init__.py").is_file(), "package name derives from title")
        sys.path.insert(0, str(directory))
        importlib.invalidate_caches()
        loaded = importlib.import_module("my_cool_api_client")
        c.equal(Path(loaded.__file__).resolve(), directory / "my_cool_api_client" / "__init__.py", "named package imports from generated output")

    def package_only():
        for explicit in (False, True):
            directory, result = outputs["none", explicit]
            c.equal(result.returncode, 0, "none mode generation")
            c.require((directory / "__init__.py").is_file(), "none output contains package contents directly")
            c.require((directory / "types.py").is_file(), "none output runtime module")
            c.require(not (directory / "my_cool_api_client").exists(), "none does not nest package")
            for name in ("pyproject.toml", "setup.py", "README.md", ".gitignore"):
                c.require(not (directory / name).exists(), f"none omits project metadata {name}")

    def project_paths():
        for mode in ("poetry", "setup", "pdm", "uv"):
            for explicit in (False, True):
                directory, result = outputs[mode, explicit]
                c.equal(result.returncode, 0, f"{mode} generation")
                c.require((directory / "my_cool_api_client" / "__init__.py").is_file(), f"{mode} package subdirectory")
                c.require((directory / "pyproject.toml").is_file(), f"{mode} project metadata location")

    for test_id, case in zip(SUITES["cli-layout"], (options, overwrite, names, package_only, project_paths, package_only)):
        c.case(test_id, case)


def diagnostic_checks(h, c):
    valid = {"type": "object", "properties": {"title": {"type": "string"}}, "required": ["title"]}

    def spec_with(schemas):
        spec = simple_spec()
        spec["components"] = {"schemas": {"Survivor": valid, **schemas}}
        return spec

    def invoke(spec, label, *flags):
        output = h.scratch / label
        _, result = h.invoke(spec, "--meta", "none", "--output-path", str(output), *flags)
        return output, result, result.stdout + result.stderr

    unsupported = {"MixedEnum": {"enum": ["a", 2]}, "UntypedArray": {"type": "array"}}

    def survives(directory, package_name):
        c.require((directory / "models" / "survivor.py").is_file(), "unaffected model source survives warning")
        # Import and use the surviving model; a filename alone is not enough.
        spec = importlib.util.spec_from_file_location(package_name, directory / "__init__.py", submodule_search_locations=[str(directory)])
        package = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = package
        spec.loader.exec_module(package)
        model = importlib.import_module(package_name + ".models").Survivor
        c.equal(model.from_dict({"title": "still usable"}).to_dict(), {"title": "still usable"}, "surviving model remains usable")

    def warning_policy():
        directory, result, message = invoke(spec_with(unsupported), "warning_default")
        c.equal(result.returncode, 0, "default warning exit is zero")
        c.require("MixedEnum" in message and "UntypedArray" in message, "warning names unsupported schemas")
        survives(directory, "surviving_warning_default")
        _, flagged, _ = invoke(spec_with(unsupported), "warning_flagged", "--fail-on-warning")
        c.require(flagged.returncode != 0, "warning flag makes warning exit nonzero")

    def unsupported_schema():
        directory, result, message = invoke(spec_with(unsupported), "unsupported_default")
        c.equal(result.returncode, 0, "unsupported schema default exit zero")
        for class_name, file_name in (("MixedEnum", "mixed_enum.py"), ("UntypedArray", "untyped_array.py")):
            c.require(class_name in message, f"diagnostic names {class_name}")
            c.require(not (directory / "models" / file_name).exists(), f"unsupported {class_name} omitted")
        survives(directory, "surviving_unsupported")
        exported = importlib.import_module("surviving_unsupported.models")
        c.require(not hasattr(exported, "MixedEnum") and not hasattr(exported, "UntypedArray"), "unsupported classes not re-exported")
        _, flagged, _ = invoke(spec_with(unsupported), "unsupported_flagged", "--fail-on-warning")
        c.require(flagged.returncode != 0, "unsupported schema flag exit nonzero")

    def circular():
        schemas = {"LoopA": {"$ref": "#/components/schemas/LoopB"}, "LoopB": {"$ref": "#/components/schemas/LoopA"},
                   "Affected": {"type": "object", "properties": {"loop": {"$ref": "#/components/schemas/LoopA"}}}}
        directory, result, message = invoke(spec_with(schemas), "circular")
        c.equal(result.returncode, 0, "circular property warning remains nonfatal")
        c.require("Circular" in message, "circular diagnostic text")
        c.require(not (directory / "models" / "affected.py").exists(), "affected schema omitted")
        survives(directory, "surviving_circular")
        c.require(not hasattr(importlib.import_module("surviving_circular.models"), "Affected"), "affected class not re-exported")

    def invalid_structure():
        malformed = [{"hello": "world"}]
        for field in ("openapi", "info.title", "info.version", "paths"):
            spec = simple_spec()
            if field.startswith("info."):
                del spec["info"][field.split(".")[1]]
            else:
                del spec[field]
            malformed.append(spec)
        for index, spec in enumerate(malformed):
            _, result, message = invoke(spec, f"invalid_{index}")
            c.require(result.returncode != 0, f"invalid structure {index} exits nonzero")
            c.require("Failed to parse OpenAPI document" in message, f"invalid structure {index} required diagnostic")
        directory, result, _ = invoke(spec_with({}), "valid_diagnostic_control")
        c.equal(result.returncode, 0, "valid OpenAPI document still succeeds")
        survives(directory, "surviving_valid_control")

    def swagger():
        spec = {"swagger": "2.0", "info": {"title": "Old API", "version": "1"}, "paths": {}}
        _, result, message = invoke(spec, "swagger")
        c.require(result.returncode != 0, "Swagger 2.0 exits nonzero")
        c.require("Swagger" in message, "Swagger diagnostic")

    for test_id, case in zip(SUITES["diagnostics"], (warning_policy, unsupported_schema, circular, invalid_structure, swagger)):
        c.case(test_id, case)


RUNNERS = {"runtime-model-core": core_checks, "enums-defaults": enum_default_checks,
           "cli-layout": layout_checks, "diagnostics": diagnostic_checks}


def load_extensions():
    for name in ("schema_models", "http_client", "cli_config"):
        path = HERE / "extensions" / (name + ".py")
        if not path.is_file():
            continue
        extension = importlib.import_module("extensions." + name)
        for suite, ids in extension.SUITES.items():
            if suite in SUITES or any(test_id in existing for test_id in ids for existing in SUITES.values()):
                raise ValueError("PUBLIC_EXTENSION_ID_COLLISION")
            SUITES[suite] = list(ids)
            RUNNERS[suite] = extension.RUNNERS[suite]


load_extensions()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="print implemented ID inventory without executing a candidate")
    parser.add_argument("--suite", choices=SUITES)
    parser.add_argument("--binding", type=Path)
    parser.add_argument("--only-test-id", action="append", default=[], help="targeted defective-control witness only; full public runs omit this option")
    options = parser.parse_args()
    if options.list:
        print(json.dumps(SUITES, sort_keys=True))
        return 0
    if not options.suite or not options.binding:
        parser.error("--suite and --binding are required when not using --list")
    if any(test_id not in SUITES[options.suite] for test_id in options.only_test_id):
        parser.error("target ID is not in the selected suite")
    selected_ids = [test_id for test_id in SUITES[options.suite] if not options.only_test_id or test_id in options.only_test_id]
    checks = Checks(set(selected_ids))
    binding = None
    harness = None
    uncertain = False
    error = None
    try:
        binding = json.loads(options.binding.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory(prefix="dag-public-check-") as scratch:
            harness = Harness(binding, scratch)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                RUNNERS[options.suite](harness, checks)
    except subprocess.TimeoutExpired:
        uncertain = True
        error = {"code": "LOCAL_COMMAND_TIMEOUT", "message": "generator exceeded the 20 second local command limit"}
    except Exception as exc:
        error = {"code": type(exc).__name__, "message": str(exc)}
    executed_ids = [case["test_id"] for case in checks.cases]
    unexecuted = [test_id for test_id in selected_ids if test_id not in executed_ids]
    passed = error is None and not unexecuted and all(case["status"] == "passed" for case in checks.cases)
    report = {
        "schema_version": "dag-public-check-evidence/v1", "check_id": "public." + options.suite,
        "check_version": CHECK_VERSION, "status": "passed" if passed else "failed",
        "executed": harness is not None, "exit_code": 0 if passed else 1,
        "assertions": sum(case["assertions"] for case in checks.cases), "skipped": len(unexecuted),
        "outcome_uncertain": uncertain, "test_ids": selected_ids, "cases": checks.cases,
        "scope": "targeted_control" if options.only_test_id else "complete_suite",
        "assertion_contract_sha256": ASSERTION_CONTRACT_SHA256,
        "unexecuted_test_ids": unexecuted, "error": error,
        "binding_kind": binding.get("kind") if isinstance(binding, dict) else None,
        "environment_ref": binding.get("environment_ref") if isinstance(binding, dict) else None,
        "python_version": sys.version.split()[0], "candidate_invocations": harness.invocations if harness else [],
        "setup_evidence": harness.install_receipt if harness else None,
        "environment_evidence": harness.environment_evidence if harness else {},
        "product_certified": False, "artifact_revisions": None,
    }
    print(json.dumps(report, sort_keys=True))
    return report["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
