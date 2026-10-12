"""R15--R17 public behavior checks, using generated code and httpx mocks only.

Expectations derive from the public instruction and D056 specifications. Control
templates live separately and are never imported by this checker.
"""
from __future__ import annotations

import asyncio
from contextlib import ExitStack
import importlib
import inspect
import io
import json
from pathlib import Path
import shlex
import sys
from types import SimpleNamespace
from typing import Literal
from urllib.parse import parse_qs
from http import HTTPStatus
from unittest.mock import patch

SUITES = {"http-client": [
    "T.R15.01", "T.R15.02", "T.R15.03",
    *[f"T.R16.{number:02d}" for number in range(1, 11)],
    "T.R17.01", "T.R17.02", "T.R17.03", "T.integration.transports",
]}
CONFIG_FIXTURE = "d065-http-config.json"
BASE_URL = "https://public-fixture.invalid"
SUCCESS = {"recordId": 7, "name": "record seven"}


def recording_clients(httpx):
    class RecordingClient(httpx.Client):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.calls = []

        def request(self, *args, **kwargs):
            self.calls.append((args, dict(kwargs)))
            return super().request(*args, **kwargs)

    class RecordingAsyncClient(httpx.AsyncClient):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.calls = []

        async def request(self, *args, **kwargs):
            self.calls.append((args, dict(kwargs)))
            return await super().request(*args, **kwargs)

    return RecordingClient, RecordingAsyncClient


def _forbid_real_http(*args, **kwargs):
    raise AssertionError("public HTTP assertions must use the installed mock transport")


def verify_config_models(pkg, directory, c, *, class_name="Payload", module_name="payload",
                         field_prefix="field_", literal_enums=False):
    """Shared behavioral probe for the config/layout integration suite."""
    models = importlib.import_module(pkg.__name__ + ".models")
    model = getattr(models, class_name)
    module = importlib.import_module(pkg.__name__ + ".models." + module_name)
    c.require((Path(directory) / "models" / (module_name + ".py")).is_file(), "configured schema module exists")
    c.require(getattr(module, class_name) is model, "configured class is re-exported")
    raw = {"3value": "digit value", "_secret": 31, "mode": "ready"}
    value = model.from_dict(raw)
    c.equal(value.to_dict(), raw, "configured property names preserve original JSON keys")
    for json_name, wanted in (("3value", "digit value"), ("_secret", 31)):
        attributes = [name for name in model.__annotations__
                      if getattr(value, name, object()) == wanted]
        c.equal(len(attributes), 1, f"one declared attribute represents {json_name}")
        c.require(attributes[0].startswith(field_prefix), f"{json_name} uses configured field prefix")
        c.require(attributes[0].isidentifier(), f"{json_name} becomes a valid identifier")
    envelope = models.Envelope.from_dict({"payload": raw})
    c.require(isinstance(envelope.payload, model), "references resolve to configured class")
    c.equal(envelope.to_dict(), {"payload": raw}, "configured reference round trip")
    if class_name != "Payload":
        c.require(class_name in models.Envelope.__annotations__["payload"], "reference annotation uses renamed class")
    if literal_enums:
        c.equal(models.Mode, Literal["ready", "waiting"], "configured enum is a Literal alias")
        c.require(type(value.mode) is str, "literal enum holds raw value")
        c.raises(TypeError, lambda: model.from_dict({**raw, "mode": "invalid"}), "literal mode rejects invalid value")
    else:
        c.require(isinstance(value.mode, models.Mode), "default enum holds enum member")


def http_checks(h, c):
    import httpx
    RecordingClient, RecordingAsyncClient = recording_clients(httpx)
    pkg, _ = h.generate("d065-http.json", "generated_http")
    module = lambda suffix: importlib.import_module(pkg.__name__ + suffix)
    client_module = module(".client")
    models, types, errors = module(".models"), module(".types"), module(".errors")
    endpoints = {name: module(".api." + ("default" if name == "list_records" else "transport") + "." + name)
                 for name in ("create_record", "list_records", "upload_record", "submit_form", "send_binary")}

    def arguments(name):
        if name == "create_record":
            return {"record_key": "a/b c#d?e&f", "state": models.State("ready"), "ids": [2, 5],
                    "body": models.JsonBody(label_name="json payload")}
        if name == "upload_record":
            return {"body": models.MultipartBody(
                upload_file=types.File(payload=io.BytesIO(b"binary fixture\x00bytes"),
                                       file_name="probe.bin", mime_type="application/octet-stream"),
                title="multipart title")}
        if name == "submit_form":
            return {"body": models.FormBody(display_name="form value & symbol")}
        if name == "send_binary":
            return {"body": b"\x00\xffraw fixture bytes"}
        return {}

    def exchange(name="create_record", *, async_mode=False, detailed=True, status=None,
                 payload=None, params=None, raise_status=False):
        if status is None:
            status = 201 if name == "create_record" else 200
        if payload is None:
            payload = [SUCCESS, {"recordId": 9, "name": "record nine"}] if name == "list_records" else SUCCESS
        requests, responses = [], []

        def handler(request):
            requests.append(request)
            response = httpx.Response(status, json=payload, headers={"x-public-response": "preserved"})
            responses.append(response)
            return response

        sync_client = RecordingClient(base_url=BASE_URL, transport=httpx.MockTransport(handler))
        async_client = RecordingAsyncClient(base_url=BASE_URL, transport=httpx.MockTransport(handler))
        client = client_module.Client(base_url=BASE_URL, raise_on_unexpected_status=raise_status)
        client.set_httpx_client(sync_client)
        client.set_async_httpx_client(async_client)
        function_name = ("asyncio" if async_mode else "sync") + ("_detailed" if detailed else "")
        supplied = arguments(name) if params is None else params
        function = getattr(endpoints[name], function_name)

        async def invoke_async():
            try:
                return await function(client=client, **supplied)
            finally:
                await async_client.aclose()

        try:
            result = asyncio.run(invoke_async()) if async_mode else function(client=client, **supplied)
        finally:
            sync_client.close()
            if not async_client.is_closed:
                asyncio.run(async_client.aclose())
        return SimpleNamespace(result=result, sync_calls=sync_client.calls, async_calls=async_client.calls,
                               requests=requests, responses=responses, parameters=supplied)

    def request_data(execution, async_mode=False):
        calls = execution.async_calls if async_mode else execution.sync_calls
        c.equal(len(calls), 1, "exactly one request is issued through the selected transport")
        c.equal(len(execution.requests), 1, "mock transport received the request")
        positional, kwargs = calls[0]
        c.equal(positional, (), "transport request uses keyword arguments")
        c.require("method" in kwargs and "url" in kwargs, "transport request names method and url")
        return kwargs, execution.requests[0]

    def detailed_response(execution, expected):
        response, raw = execution.result, execution.responses[0]
        c.require(isinstance(response, types.Response), "detailed function returns runtime Response")
        c.require(isinstance(response.status_code, HTTPStatus), "response status is HTTPStatus")
        c.equal(response.status_code, HTTPStatus(raw.status_code), "response status value")
        c.equal(response.content, raw.content, "response body bytes preserved")
        c.equal(dict(response.headers), dict(raw.headers), "response headers preserved")
        c.equal(response.parsed, expected, "detailed parsed response")

    def constructors():
        for cls in (client_module.Client, client_module.AuthenticatedClient):
            settings = {"base_url": BASE_URL}
            if cls is client_module.AuthenticatedClient:
                settings["token"] = "fixture-token"
            c.equal(cls(**settings), cls(**settings), "clients compare by value")
            c.require(cls(**settings) != cls(**{**settings, "base_url": BASE_URL + "/other"}), "base URL affects client equality")
            signature = inspect.signature(cls)
            c.equal(signature.parameters["raise_on_unexpected_status"].default, False, "unexpected status defaults to False")
            c.require(cls(**settings, raise_on_unexpected_status=True).raise_on_unexpected_status, "explicit unexpected status policy")
        auth_signature = inspect.signature(client_module.AuthenticatedClient)
        c.equal(auth_signature.parameters["prefix"].default, "Bearer", "default authentication prefix")
        c.equal(auth_signature.parameters["auth_header_name"].default, "Authorization", "default authentication header")
        c.require(auth_signature.parameters["token"].default is inspect.Parameter.empty, "authentication token is required")

    def storage_and_auth():
        for cls, settings, header in (
            (client_module.Client, {}, None),
            (client_module.AuthenticatedClient, {"token": "fixture-token"}, ("Authorization", "Bearer fixture-token")),
            (client_module.AuthenticatedClient, {"token": "custom-token", "prefix": "Token", "auth_header_name": "X-Credential"},
             ("X-Credential", "Token custom-token")),
        ):
            client = cls(base_url=BASE_URL, **settings)
            sync_client, async_client = client.get_httpx_client(), client.get_async_httpx_client()
            try:
                c.require(isinstance(sync_client, httpx.Client), "sync getter constructs httpx.Client")
                c.require(isinstance(async_client, httpx.AsyncClient), "async getter constructs httpx.AsyncClient")
                for transport in (sync_client, async_client):
                    c.equal(str(transport.base_url).rstrip("/"), BASE_URL, "constructed client base URL")
                    if header:
                        c.equal(transport.headers.get(header[0]), header[1], "stored authentication settings")
                replacement_sync = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(204)))
                replacement_async = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(204)))
                try:
                    client.set_httpx_client(replacement_sync)
                    client.set_async_httpx_client(replacement_async)
                    c.require(client.get_httpx_client() is replacement_sync, "sync setter preserves explicit object identity")
                    c.require(client.get_async_httpx_client() is replacement_async, "async setter preserves explicit object identity")
                finally:
                    replacement_sync.close()
                    asyncio.run(replacement_async.aclose())
            finally:
                sync_client.close()
                asyncio.run(async_client.aclose())

    def helpers():
        original = client_module.AuthenticatedClient(base_url=BASE_URL, token="kept", prefix="Custom",
                                                     auth_header_name="X-Auth", raise_on_unexpected_status=True)
        first = original.with_headers({"X-First": "one"})
        second = first.with_headers({"X-Second": "two"})
        cookies = second.with_cookies({"first": "cookie-one"})
        merged = cookies.with_cookies({"second": "cookie-two"})
        final = merged.with_timeout(httpx.Timeout(4.25))
        values = (original, first, second, cookies, merged, final)
        c.equal(len({id(item) for item in values}), len(values), "all helpers return new client objects")
        transports = [(item.get_httpx_client(), item.get_async_httpx_client()) for item in values]
        try:
            for sync_client, async_client in transports:
                for transport in (sync_client, async_client):
                    c.equal(str(transport.base_url).rstrip("/"), BASE_URL, "helpers preserve base URL")
                    c.equal(transport.headers.get("X-Auth"), "Custom kept", "helpers preserve auth settings")
            c.require(all(item.raise_on_unexpected_status for item in values), "helpers preserve status policy")
            for index in (0, 1):
                c.require("X-First" not in transports[0][index].headers, "original headers stay unchanged")
                c.require("X-Second" not in transports[1][index].headers, "earlier clone stays unchanged")
                c.equal(transports[-1][index].headers.get("X-First"), "one", "header merge preserves existing value")
                c.equal(transports[-1][index].headers.get("X-Second"), "two", "header merge adds value")
                c.require("second" not in transports[3][index].cookies, "prior cookies stay unchanged")
                c.equal(transports[-1][index].cookies.get("first"), "cookie-one", "cookie update preserves prior cookie")
                c.equal(transports[-1][index].cookies.get("second"), "cookie-two", "cookie update adds cookie")
                c.equal(transports[-1][index].timeout, httpx.Timeout(4.25), "timeout update reaches transport")
        finally:
            for sync_client, async_client in transports:
                sync_client.close()
                asyncio.run(async_client.aclose())

    def endpoint_functions():
        endpoint = endpoints["create_record"]
        for name in ("sync_detailed", "sync", "asyncio_detailed", "asyncio"):
            function = getattr(endpoint, name)
            parameters = inspect.signature(function).parameters
            c.require({"client", "record_key", "state", "ids", "note", "body"}.issubset(parameters), "endpoint exposes all parameters")
            c.require(all(value.kind is inspect.Parameter.KEYWORD_ONLY for value in parameters.values()), "endpoint parameters are keyword-only")
        expected = models.Record.from_dict(SUCCESS)
        for async_mode in (False, True):
            detailed_response(exchange(async_mode=async_mode), expected)
            c.equal(exchange(async_mode=async_mode, detailed=False).result, expected, "simple function returns parsed value")

    def encoded_path(execution, async_mode=False):
        _, request = request_data(execution, async_mode)
        c.equal(request.url.raw_path.split(b"?")[0], b"/records/a%2Fb%20c%23d%3Fe%26f", "reserved path-segment characters percent-encoded")

    def query_values(execution, async_mode=False):
        kwargs, request = request_data(execution, async_mode)
        c.require(isinstance(kwargs.get("params"), dict), "query arguments use params dict")
        c.equal(kwargs["params"].get("state"), "ready", "query enum serialized to raw value")
        c.require(type(kwargs["params"].get("state")) is str, "query enum is not an enum object")
        c.equal(kwargs["params"].get("ids"), [2, 5], "query array remains a list")
        c.require("note" not in kwargs["params"], "UNSET query omitted")
        c.equal(request.url.params.get_list("ids"), ["2", "5"], "query array repeats its key on wire")
        c.require("note" not in request.url.params, "UNSET query absent on wire")

    def body_representation(name, execution, async_mode=False):
        kwargs, request = request_data(execution, async_mode)
        body = execution.parameters["body"]
        if name == "create_record":
            c.equal(kwargs.get("json"), {"labelName": "json payload"}, "JSON request uses body.to_dict")
            c.equal(json.loads(request.content), {"labelName": "json payload"}, "JSON wire body")
        elif name == "upload_record":
            multipart = body.to_multipart()
            c.require(isinstance(multipart, list), "multipart representation is a list")
            c.equal(kwargs.get("files"), multipart, "multipart request passes body.to_multipart")
            fields = dict(multipart)
            c.equal(fields.get("uploadFile"), body.upload_file.to_tuple(), "binary multipart field uses File tuple")
            c.equal(fields.get("title"), (None, b"multipart title", "text/plain"), "scalar multipart field uses bytes tuple")
            c.require(b'binary fixture\x00bytes' in request.content and b'multipart title' in request.content, "multipart wire body carries file and scalar")
        elif name == "submit_form":
            c.equal(kwargs.get("data"), {"displayName": "form value & symbol"}, "form request uses body.to_dict")
            c.equal(parse_qs(request.content.decode()), {"displayName": ["form value & symbol"]}, "form wire encoding")
        elif name == "send_binary":
            c.equal(kwargs.get("content"), body, "binary request uses content bytes")
            c.equal(request.content, body, "binary wire body stays byte-exact")

    def media_type(name, execution, async_mode=False):
        kwargs, request = request_data(execution, async_mode)
        expected = {"create_record": "application/json", "upload_record": "multipart/form-data",
                    "submit_form": "application/x-www-form-urlencoded", "send_binary": "application/octet-stream"}[name]
        header = httpx.Headers(kwargs.get("headers", {})).get("content-type", "")
        c.equal(header.split(";", 1)[0].strip(), expected, "body media type is explicitly passed as a request header")
        c.equal(request.headers.get("content-type", "").split(";", 1)[0].strip(), expected, "body media type reaches wire request")

    def form_and_binary():
        for name in ("submit_form", "send_binary"):
            body_representation(name, exchange(name))

    def media_types():
        for name in ("create_record", "upload_record", "submit_form", "send_binary"):
            media_type(name, exchange(name))

    def dispatch():
        for async_mode in (False, True):
            execution = exchange(async_mode=async_mode)
            kwargs, request = request_data(execution, async_mode)
            c.equal(execution.sync_calls if async_mode else execution.async_calls, [], "other transport was not called")
            c.equal(kwargs["method"].upper(), "POST", "operation method dispatch")
            c.equal(request.method, "POST", "transport received operation method")

    def documented_responses(async_mode=False):
        good = exchange(async_mode=async_mode)
        c.require(isinstance(good.result.parsed, models.Record), "documented model response converted")
        detailed_response(good, models.Record.from_dict(SUCCESS))
        failure = exchange(async_mode=async_mode, status=400, payload={"message": "rejected"})
        c.require(isinstance(failure.result.parsed, models.ErrorDetail), "documented error response converted")
        c.equal(failure.result.parsed.message, "rejected", "documented error value")
        listing = exchange("list_records", async_mode=async_mode)
        c.require(isinstance(listing.result.parsed, list), "documented list response is a list")
        c.require(all(isinstance(item, models.Record) for item in listing.result.parsed), "documented list members converted")
        c.equal([item.record_id for item in listing.result.parsed], [7, 9], "documented list values")

    def undocumented_statuses(async_mode=False):
        relaxed = exchange(async_mode=async_mode, status=418, payload={"message": "teapot"})
        c.equal(relaxed.result.parsed, None, "undocumented status parses as None by default")
        c.equal(relaxed.result.status_code, HTTPStatus.IM_A_TEAPOT, "undocumented status remains in detailed response")
        c.equal(exchange(async_mode=async_mode, detailed=False, status=418).result, None, "simple undocumented response is None")
        c.raises(errors.UnexpectedStatus,
                 lambda: exchange(async_mode=async_mode, status=418, raise_status=True),
                 "strict client rejects undocumented status")

    def post_hooks():
        script = ("import json; from pathlib import Path; "
                  "Path('.public-hook.json').write_text(json.dumps({'cwd': str(Path.cwd().resolve()), "
                  "'generated': Path('__init__.py').is_file()}))")
        # Isolated Python keeps the generated package's types.py from shadowing
        # the stdlib when this hook starts inside a --meta none output folder.
        command = shlex.quote(sys.executable) + " -I -c " + shlex.quote(script)
        _, output = h.generate(CONFIG_FIXTURE, "generated_http_hook", config={"post_hooks": [command]})
        marker = output / ".public-hook.json"
        c.require(marker.is_file(), "configured hook executed")
        evidence = json.loads(marker.read_text())
        c.equal(evidence, {"cwd": str(output.resolve()), "generated": True}, "hook runs after generation in output directory")
        _, empty_output = h.generate(CONFIG_FIXTURE, "generated_http_empty_hooks", config={"post_hooks": []})
        c.require(not (empty_output / ".public-hook.json").exists(), "empty hook list does not run prior hook")
        document = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / CONFIG_FIXTURE).read_text())
        missing_output = h.scratch / "generated_http_missing_hook"
        _, result = h.invoke(document, "--meta", "none", "--output-path", str(missing_output),
                             config={"post_hooks": ["d065-public-command-does-not-exist-7826"]})
        c.equal(result.returncode, 0, "missing hook command is not a generation failure")
        text = (result.stdout + result.stderr).lower()
        c.require("warning" in text and "d065-public-command-does-not-exist-7826" in text, "missing hook command emits named warning")
        c.require((missing_output / "__init__.py").is_file(), "missing hook retains generated package")

    def class_overrides():
        config = {"post_hooks": [], "class_overrides": {"Payload": {"class_name": "RenamedPayload", "module_name": "renamed_payload"}}}
        configured, directory = h.generate(CONFIG_FIXTURE, "generated_http_override", config=config)
        verify_config_models(configured, directory, c, class_name="RenamedPayload", module_name="renamed_payload")

    def field_prefixes():
        for suffix, prefix, config in (("default", "field_", {"post_hooks": []}),
                                      ("custom", "public_", {"post_hooks": [], "field_prefix": "public_"})):
            configured, directory = h.generate(CONFIG_FIXTURE, "generated_http_prefix_" + suffix, config=config)
            verify_config_models(configured, directory, c, field_prefix=prefix)

    def combined_transports():
        for async_mode in (False, True):
            for name in ("create_record", "upload_record", "submit_form", "send_binary"):
                execution = exchange(name, async_mode=async_mode)
                body_representation(name, execution, async_mode)
                media_type(name, execution, async_mode)
                detailed_response(execution, models.Record.from_dict(SUCCESS))
                c.equal(exchange(name, async_mode=async_mode, detailed=False).result,
                        models.Record.from_dict(SUCCESS), "simple response matches parsed model")
                if name == "create_record":
                    encoded_path(execution, async_mode)
                    query_values(execution, async_mode)
            documented_responses(async_mode)
            undocumented_statuses(async_mode)

    functions = (constructors, storage_and_auth, helpers, endpoint_functions,
                 lambda: encoded_path(exchange()), lambda: query_values(exchange()),
                 lambda: body_representation("create_record", exchange()),
                 lambda: body_representation("upload_record", exchange("upload_record")),
                 form_and_binary, media_types, dispatch, documented_responses, undocumented_statuses,
                 post_hooks, class_overrides, field_prefixes, combined_transports)
    with ExitStack() as blockers:
        blockers.enter_context(patch.object(httpx.HTTPTransport, "handle_request", _forbid_real_http))
        blockers.enter_context(patch.object(httpx.AsyncHTTPTransport, "handle_async_request", _forbid_real_http))
        for test_id, function in zip(SUITES["http-client"], functions):
            c.case(test_id, function)


RUNNERS = {"http-client": http_checks}
