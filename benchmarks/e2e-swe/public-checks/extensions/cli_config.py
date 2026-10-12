"""Public CLI, configuration and real offline-install acceptance checks.

Run this suite in the preinstalled, network-none Docker environment. Installation
is executed on a fresh candidate copy; declarations alone never pass setup checks.
"""
from __future__ import annotations

import ast
import contextlib
import importlib
import importlib.util
import json
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUITES = {"cli-config-environment": [
    "T.R01.01", "T.R01.02", "T.R01.03", "T.R02.01", "T.R02.02", "T.R02.03",
    "T.R03.01", "T.R03.03", "T.R03.06", "T.R18.01", "T.R18.02", "T.R19.03",
    "T.R20.01", "T.integration.config-layout", "T.integration.diagnostics",
]}
HERE = Path(__file__).resolve().parents[1]


def import_package(directory):
    directory = Path(directory).resolve()
    name = directory.name
    for loaded in list(sys.modules):
        if loaded == name or loaded.startswith(name + "."):
            del sys.modules[loaded]
    sys.path.insert(0, str(directory.parent))
    importlib.invalidate_caches()
    module = importlib.import_module(name)
    if Path(module.__file__).resolve() != directory / "__init__.py":
        raise AssertionError("package import escaped newly generated output")
    return module


def parse_metadata(directory):
    try:
        import tomllib
    except ModuleNotFoundError:
        import tomli as tomllib
    return tomllib.loads((Path(directory) / "pyproject.toml").read_text(encoding="utf-8"))


@contextlib.contextmanager
def source_server(document):
    body = json.dumps(document).encode("utf-8")
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            received.append(self.path)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/source.json", received
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def output_policy_checks(h, c, fixture, exercise_sample):
    """The same public overwrite/hook predicates with stable evidence IDs.

    Keep calls in their original order: a failed assertion stops this parent
    case, and later declarations remain not_reached rather than failed.
    """
    output = h.scratch / "combined_overwrite"
    output.mkdir()
    _, refused = h.invoke(fixture, "--meta", "none", "--output-path", str(output), installed=True)
    c.require(refused.returncode != 0, "existing output refused",
              assertion_id="A.integration.diagnostics.existing-output-refused")
    _, accepted = h.invoke(fixture, "--meta", "none", "--output-path", str(output), "--overwrite", installed=True)
    c.equal(accepted.returncode, 0, "overwrite accepted",
            assertion_id="A.integration.diagnostics.overwrite-accepted")
    exercise_sample(output)
    hook_output = h.scratch / "combined_missing_hook"
    _, missing_hook = h.invoke(fixture, "--meta", "none", "--output-path", str(hook_output),
                                config={"post_hooks": ["d065-public-command-does-not-exist-7826"]}, installed=True)
    c.equal(missing_hook.returncode, 0, "missing hook is a warning",
            assertion_id="A.integration.diagnostics.missing-hook-exit")
    c.require("d065-public-command-does-not-exist-7826" in missing_hook.stdout + missing_hook.stderr, "missing hook diagnostic",
              assertion_id="A.integration.diagnostics.missing-hook-diagnostic")
    exercise_sample(hook_output)


def cli_checks(h, c):
    fixture = json.loads((HERE / "fixtures" / "d065-cli.json").read_text(encoding="utf-8"))
    config_fixture = json.loads((HERE / "fixtures" / "d065-http-config.json").read_text(encoding="utf-8"))
    cache = {}
    custom_config = {"post_hooks": [], "class_overrides": {"Payload": {"class_name": "ConfiguredPayload", "module_name": "configured_payload"}},
                     "field_prefix": "custom_", "literal_enums": True}

    def installed():
        return h.install_candidate()

    def traces():
        receipt = installed()
        path = Path(receipt["trace_path"])
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.is_file() else []

    def installed_metadata():
        if "installed_metadata" not in cache:
            receipt = installed()
            program = (
                "import importlib.metadata as m,importlib,json,os; "
                "e=[x for x in m.entry_points(group='console_scripts') if x.name=='pyclientgen']; "
                "print(json.dumps({'cwd':os.getcwd(),'entries':[{'name':x.dist.metadata['Name'],'requires':x.dist.requires or [],'value':x.value,"
                "'source':importlib.import_module(x.module).__file__,'callable':callable(x.load())} for x in e]}))"
            )
            # A source checkout at the inherited cwd shadows an editable install
            # for python -c. Query from an empty directory, never the source root.
            with tempfile.TemporaryDirectory(prefix="metadata-query-", dir=h.scratch) as query_directory:
                result = subprocess.run([receipt["python"], "-c", program], cwd=query_directory,
                                        env=h.installed_environment, capture_output=True, text=True, timeout=20)
            if result.returncode:
                raise AssertionError("installed metadata query failed: " + result.stderr[-1000:])
            receipt["entrypoint_metadata_probe"] = json.loads(result.stdout)
            cache["installed_metadata"] = receipt["entrypoint_metadata_probe"]["entries"]
        return cache["installed_metadata"]

    def generated_sources():
        if "generated_sources" not in cache:
            records = []
            for version in ("3.0.3", "3.1.0"):
                for suffix in (".json", ".yaml"):
                    document = json.loads(json.dumps(fixture))
                    document["openapi"] = version
                    name = "cli_source_" + version.replace(".", "_") + suffix.replace(".", "_")
                    output = h.scratch / name
                    _, result = h.invoke(document, "--meta", "none", "--output-path", str(output), suffix=suffix, installed=True)
                    if result.returncode:
                        raise AssertionError(f"valid {version}/{suffix} generation failed: {result.stdout[-500:]} {result.stderr[-1000:]}")
                    records.append({"version": version, "suffix": suffix, "directory": output})
            cache["generated_sources"] = records
        return cache["generated_sources"]

    def exercise_sample(directory):
        import httpx
        pkg = import_package(directory)
        models = importlib.import_module(pkg.__name__ + ".models")
        client_module = importlib.import_module(pkg.__name__ + ".client")
        operation = importlib.import_module(pkg.__name__ + ".api.default.get_sample")
        received = []

        def response(request):
            received.append(request)
            return httpx.Response(200, json={"value": "transport value"})

        with httpx.Client(base_url="https://public-fixture.invalid", transport=httpx.MockTransport(response)) as transport:
            client = client_module.Client(base_url="https://public-fixture.invalid")
            client.set_httpx_client(transport)
            value = operation.sync(client=client)
        c.equal(len(received), 1, "generated operation actually invokes the installed httpx transport")
        c.equal(received[0].url.path, "/sample", "generated operation path")
        c.require(isinstance(value, models.Sample), "generated operation parses the declared typed model")
        c.equal(value.to_dict(), {"value": "transport value"}, "operation uses actual response content")
        c.equal(models.Sample.__annotations__["value"], "str", "generated schema is typed")
        return pkg, models

    def config_matrix():
        if "config_matrix" not in cache:
            records = []
            for mode in ("none", "poetry", "setup", "pdm", "uv"):
                for explicit in (False, True):
                    for config_kind in ("omitted", "json", "yaml"):
                        name = f"matrix_{mode}_{int(explicit)}_{config_kind}"
                        output = h.scratch / name
                        options = ["--meta", mode]
                        if explicit:
                            options += ["--output-path", str(output)]
                        cwd, result = h.invoke(config_fixture, *options, config=False if config_kind == "omitted" else custom_config,
                                               config_suffix=".yaml" if config_kind == "yaml" else ".json", installed=True)
                        project = output if explicit else cwd / ("public_http_config_client" if mode == "none" else "public-http-config-client")
                        package = project if mode == "none" else project / "public_http_config_client"
                        records.append({"mode": mode, "explicit": explicit, "config_kind": config_kind, "project": project,
                                        "package": package, "result": result})
            cache["config_matrix"] = records
        return cache["config_matrix"]

    def verify_config(record):
        from extensions.http_client import verify_config_models
        c.equal(record["result"].returncode, 0, "configuration/layout generation succeeds: " + record["result"].stderr[-300:])
        pkg = import_package(record["package"])
        configured = record["config_kind"] != "omitted"
        verify_config_models(pkg, record["package"], c,
                             class_name="ConfiguredPayload" if configured else "Payload",
                             module_name="configured_payload" if configured else "payload",
                             field_prefix="custom_" if configured else "field_", literal_enums=configured)
        return pkg

    def metadata_fields(record):
        metadata = parse_metadata(record["project"])
        project = metadata.get("project", metadata.get("tool", {}).get("poetry", {}))
        c.equal(project.get("name"), "public-http-config-client", "metadata project name")
        c.equal(project.get("version"), config_fixture["info"]["version"], "metadata uses info.version")
        dependencies = project.get("dependencies", [])
        if isinstance(dependencies, dict):
            dependencies = list(dependencies)
        c.require(any(re.match(r"httpx(?:\b|[<>=\[])", str(item), re.I) for item in dependencies), "metadata declares generated httpx runtime")

    def complete_package():
        for record in generated_sources():
            pkg, _ = exercise_sample(record["directory"])
            for relative in ("__init__.py", "types.py", "client.py", "errors.py", "models/__init__.py", "api/default/get_sample.py"):
                c.require((record["directory"] / relative).is_file(), f"complete generated runtime/API file {relative}")
            c.require(importlib.import_module(pkg.__name__ + ".types").Response is not None, "runtime support imports")

    def console_entrypoint():
        receipt = installed()
        c.equal(receipt["exit_code"], 0, "actual setup execution succeeds")
        c.require(Path(receipt["console_script"]).is_file(), "installed console script exists")
        output = h.scratch / f"installed_cli_result_{h.count}"
        _, result = h.invoke(fixture, "--meta", "none", "--output-path", str(output), installed=True)
        c.equal(result.returncode, 0, "installed pyclientgen command generates successfully")
        c.require((output / "models" / "sample.py").is_file(), "installed command invokes generator")
        entries = installed_metadata()
        c.equal(len(entries), 1, "one installed console entrypoint named pyclientgen")
        c.require(entries[0]["callable"], "registered console entrypoint is callable, including callable app objects")
        c.require(Path(entries[0]["source"]).resolve().is_relative_to(h.installed_root), "installed entrypoint resolves to this fresh candidate source")

    def formats_and_equality():
        for record in generated_sources():
            _, models = exercise_sample(record["directory"])
            c.equal(models.Sample(value="same"), models.Sample(value="same"), "model value equality in both source formats")
            c.require(models.Sample(value="a") != models.Sample(value="b"), "different model values differ")

    def offline_environment():
        c.require(Path("/proc/net/route").is_file(), "offline environment must expose actual Linux network namespace")
        import fcntl
        import struct
        interfaces = []
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            for _, name in socket.if_nameindex():
                flags = struct.unpack("H", fcntl.ioctl(probe.fileno(), 0x8913, struct.pack("256s", name.encode()[:15]))[16:18])[0]
                interfaces.append({"name": name, "up": bool(flags & 1), "loopback": bool(flags & 8)})
        c.require(all(not item["up"] or item["loopback"] for item in interfaces), "no active non-loopback interface in actual namespace")
        routes = Path("/proc/net/route").read_text().splitlines()[1:]
        c.require(not any(line.strip() for line in routes), "no IPv4 egress route in actual namespace")
        for name in ("httpx", "ruamel.yaml", "setuptools", "pip"):
            c.require(importlib.util.find_spec(name) is not None, f"dependency is preinstalled: {name}")
        receipt = installed()
        c.equal(receipt["exit_code"], 0, "offline setup actually completed")
        c.require("Downloading " not in receipt["stdout"] + receipt["stderr"], "setup output shows no fetched distributions")
        h.environment_evidence.update({"interfaces": interfaces, "ipv4_routes": routes, "network_none_observed": True,
                                       "preinstalled_modules": ["httpx", "ruamel.yaml", "setuptools", "pip"]})

    def selected_dependencies():
        generated_sources()
        observed = traces()
        c.require(any(row["event"] == "parser" and str(h.installed_root) in row.get("caller", "") for row in observed), "candidate actually calls standard-library JSON parsing")
        c.require(any(row["event"] == "import" and row.get("module") == "ruamel.yaml" for row in observed), "YAML generation actually imports ruamel.yaml")
        c.require(not any(row["event"] == "import" and row.get("module") == "yaml" for row in observed), "candidate does not use unavailable PyYAML")
        for record in generated_sources():
            c.require(any("httpx" in path.read_text(encoding="utf-8") for path in record["directory"].rglob("*.py")), "generated client code imports httpx transport")

    def declared_dependencies():
        generated_sources()
        entries = installed_metadata()
        c.equal(len(entries), 1, "installed project has one pyclientgen entrypoint")
        canonical = lambda name: re.sub(r"[-_.]+", "-", name).lower()
        declared = {canonical(re.split(r"[\s<>=!~;\[]", requirement, maxsplit=1)[0]) for requirement in entries[0]["requires"]}
        required = {"httpx", "ruamel-yaml"}
        optional = {"attrs": "attrs", "attr": "attrs", "pydantic": "pydantic", "jinja2": "jinja2", "typer": "typer"}
        for path in h.installed_root.rglob("*.py"):
            if any(part.startswith(".") or part in ("test", "tests", "__pycache__") for part in path.relative_to(h.installed_root).parts):
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeError):
                continue
            for node in ast.walk(tree):
                names = [item.name for item in node.names] if isinstance(node, ast.Import) else [node.module] if isinstance(node, ast.ImportFrom) and node.module and node.level == 0 else []
                for name in names:
                    if name.split(".")[0] in optional:
                        required.add(optional[name.split(".")[0]])
        c.require(required <= declared, f"used runtime libraries are declared: missing {sorted(required - declared)}")
        c.equal(installed()["exit_code"], 0, "declared dependencies were already available for actual offline install")

    def source_selection():
        cwd = h.scratch / "source_selection"
        cwd.mkdir()
        source = cwd / "source.json"
        h.write_document(source, fixture)
        with source_server(fixture) as (url, received):
            output = h.scratch / "selected_url"
            _, url_result = h.run(["generate", "--url", url, "--meta", "none", "--output-path", str(output)], installed=True)
            c.equal(url_result.returncode, 0, "URL-only source generation")
            c.require("/source.json" in received and all(path == "/source.json" for path in received), "controlled local URL actually read")
            exercise_sample(output)
            _, both = h.run(["generate", "--path", str(source), "--url", url, "--output-path", str(h.scratch / "both_sources")], installed=True)
            c.require(both.returncode != 0, "both path and URL are rejected")
        _, neither = h.run(["generate", "--output-path", str(h.scratch / "no_source")], installed=True)
        c.require(neither.returncode != 0, "neither path nor URL is rejected")
        _, path_result = h.invoke(fixture, "--meta", "none", "--output-path", str(h.scratch / "selected_path"), installed=True)
        c.equal(path_result.returncode, 0, "path-only source generation")

    def config_formats():
        for record in config_matrix():
            if record["mode"] == "none" and record["explicit"]:
                verify_config(record)

    def parser_suffix():
        records = generated_sources()
        c.equal({row["suffix"] for row in records}, {".json", ".yaml"}, "valid JSON and YAML paths exercised")
        directory = h.scratch / f"suffix_discrimination_{h.count}"
        directory.mkdir()
        yaml_text = directory / "yaml_content.json"
        from ruamel.yaml import YAML
        with yaml_text.open("w") as stream:
            YAML().dump(fixture, stream)
        _, rejected = h.run(["generate", "--path", str(yaml_text), "--output-path", str(directory / "should_fail")], installed=True)
        c.require(rejected.returncode != 0 and "Invalid JSON" in rejected.stdout + rejected.stderr, ".json suffix selects JSON even for YAML-valid content")
        output = h.scratch / f"yaml_other_suffix_{h.count}"
        _, accepted = h.invoke(fixture, "--meta", "none", "--output-path", str(output), suffix=".other", installed=True)
        c.equal(accepted.returncode, 0, "non-JSON suffix selects YAML")
        exercise_sample(output)

    def poetry_metadata():
        for record in config_matrix():
            if record["mode"] != "poetry":
                continue
            c.equal(record["result"].returncode, 0, "poetry generation")
            metadata_fields(record)
            for name in ("README.md", ".gitignore"):
                c.require((record["project"] / name).is_file(), f"poetry includes {name}")
            c.require((record["package"] / "__init__.py").is_file(), "poetry package subdirectory")
        cwd, result = h.invoke(fixture, installed=True)
        c.equal(result.returncode, 0, "omitted metadata mode accepted")
        c.require((cwd / "public-cli-client" / "pyproject.toml").is_file(), "omitted mode defaults to poetry project output")

    def metadata_variants():
        for record in config_matrix():
            if record["mode"] not in ("setup", "pdm", "uv"):
                continue
            c.equal(record["result"].returncode, 0, f"{record['mode']} generation")
            c.require(isinstance(parse_metadata(record["project"]), dict), "metadata variant is valid TOML")
            c.require((record["package"] / "__init__.py").is_file(), "variant contains package subdirectory")
            if record["mode"] == "setup":
                for name in ("setup.py", "README.md", ".gitignore"):
                    c.require((record["project"] / name).is_file(), f"setup includes {name}")

    def malformed_sources():
        directory = h.scratch / "malformed_sources"
        directory.mkdir(exist_ok=True)
        for suffix, value, message in ((".json", '{"openapi":', "Invalid JSON"), (".yaml", "openapi: [broken", "Invalid YAML")):
            source = directory / ("broken" + suffix)
            source.write_text(value, encoding="utf-8")
            _, result = h.run(["generate", "--path", str(source), "--output-path", str(directory / ("output" + suffix))], installed=True)
            c.require(result.returncode != 0, f"malformed {suffix} exits nonzero")
            c.require(message in result.stdout + result.stderr, f"malformed {suffix} required diagnostic")
        for record in generated_sources():
            c.require((record["directory"] / "models" / "sample.py").is_file(), "positive format control succeeds")

    def editable_setup():
        receipt = installed()
        c.equal(receipt["exit_code"], 0, "actual offline editable setup succeeds")
        c.equal(receipt["interpreter_identity"]["prefix"], receipt["venv"], "installer interpreter is in isolated venv")
        c.require(Path(receipt["interpreter_identity"]["purelib"]).is_relative_to(receipt["venv"]), "package installation directory is inside isolated venv")
        processes = [row for row in traces() if row["event"] == "python_process" and "install" in row.get("argv", [])]
        c.require(bool(processes), "actual pip installation process observed")
        for process in processes:
            args = process["argv"]
            c.require("--no-build-isolation" in args, "actual install disables build isolation")
            editable = None
            for index, value in enumerate(args):
                if value in ("-e", "--editable") and index + 1 < len(args):
                    editable = args[index + 1]
                elif value.startswith("--editable="):
                    editable = value.split("=", 1)[1]
                elif value.startswith("-e") and not value.startswith("--") and len(value) > 2:
                    editable = value[2:]
            c.require(editable is not None, "actual install is editable")
            c.require(Path(process["cwd"], editable).resolve() == h.installed_root, "editable install selects this copied local project")
            c.equal(process["pip_no_index"], "1", "actual installer has no-index environment")
        console_entrypoint()

    def combined_config_layout():
        for record in config_matrix():
            pkg = verify_config(record)
            for name in ("types.py", "client.py", "errors.py", "api/__init__.py", "api/config/__init__.py", "api/config/echo_payload.py",
                         "models/inline_holder_inline_choice.py", "models/echo_payload_body.py"):
                c.require((record["package"] / name).is_file(), f"configured complete layout {name}")
            models = importlib.import_module(pkg.__name__ + ".models")
            c.require(hasattr(models, "InlineHolderInlineChoice") and hasattr(models, "EchoPayloadBody"), "inline model classes are exported")
            c.require(callable(importlib.import_module(pkg.__name__ + ".api.config.echo_payload").sync), "tagged operation imports")
            if record["mode"] == "none":
                for name in ("pyproject.toml", "setup.py", "README.md", ".gitignore"):
                    c.require(not (record["project"] / name).exists(), "none mode has no metadata " + name)
            else:
                metadata_fields(record)
        c.equal(len(config_matrix()), 30, "all modes, output choices and no/JSON/YAML configs exercised through installed CLI")

    def combined_diagnostics():
        malformed_sources()
        parser_suffix()
        valid = {"type": "object", "required": ["title"], "properties": {"title": {"type": "string"}}}
        scenarios = [
            ("unsupported", {"Survivor": valid, "MixedEnum": {"enum": ["x", 2]}, "UntypedArray": {"type": "array"}}, ["MixedEnum", "UntypedArray"]),
            ("circular", {"Survivor": valid, "Affected": {"type": "object", "properties": {"loop": {"$ref": "#/components/schemas/LoopA"}}},
                          "LoopA": {"$ref": "#/components/schemas/LoopB"}, "LoopB": {"$ref": "#/components/schemas/LoopA"}}, ["Circular"]),
        ]
        for name, schemas, messages in scenarios:
            document = {"openapi": "3.1.0", "info": {"title": "Diagnostics", "version": "1"}, "paths": {}, "components": {"schemas": schemas}}
            output = h.scratch / ("combined_" + name)
            _, result = h.invoke(document, "--meta", "none", "--output-path", str(output), installed=True)
            c.equal(result.returncode, 0, f"{name} warning preserves successful exit")
            for message in messages:
                c.require(message in result.stdout + result.stderr, "warning diagnostic " + message)
            pkg = import_package(output)
            models = importlib.import_module(pkg.__name__ + ".models")
            c.equal(models.Survivor.from_dict({"title": "survives"}).to_dict(), {"title": "survives"}, "unaffected code survives warning")
            for absent in ("MixedEnum", "UntypedArray", "Affected"):
                c.require(not hasattr(models, absent), "affected/unsupported schema omitted " + absent)
            _, flagged = h.invoke(document, "--meta", "none", "--output-path", str(h.scratch / ("flagged_" + name)), "--fail-on-warning", installed=True)
            c.require(flagged.returncode != 0, "warning flag changes exit status")
        for index, key in enumerate(("openapi", "info.title", "info.version", "paths")):
            document = json.loads(json.dumps(fixture))
            parts = key.split(".")
            del (document if len(parts) == 1 else document[parts[0]])[parts[-1]]
            _, result = h.invoke(document, "--output-path", str(h.scratch / f"missing_{index}"), installed=True)
            c.require(result.returncode != 0 and "Failed to parse OpenAPI document" in result.stdout + result.stderr, "missing required OpenAPI field " + key)
        _, swagger = h.invoke({"swagger": "2.0", "info": {"title": "Old", "version": "1"}, "paths": {}}, installed=True)
        c.require(swagger.returncode != 0 and "Swagger" in swagger.stdout + swagger.stderr, "Swagger fatal severity")
        output_policy_checks(h, c, fixture, exercise_sample)

    cases = (complete_package, console_entrypoint, formats_and_equality, offline_environment, selected_dependencies,
             declared_dependencies, source_selection, config_formats, parser_suffix, poetry_metadata, metadata_variants,
             malformed_sources, editable_setup, combined_config_layout, combined_diagnostics)
    for test_id, case in zip(SUITES["cli-config-environment"], cases):
        c.case(test_id, case)


RUNNERS = {"cli-config-environment": cli_checks}
