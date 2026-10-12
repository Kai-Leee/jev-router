"""Finite HTTP/config control emitter, independent of the public assertions.

Only the two authored Public HTTP fixture titles are supported. This emitter is
checker evidence, not a general generator or a benchmark candidate.
"""
from __future__ import annotations

from textwrap import dedent

from templates import source_files


CONTROL_CASES = [
    {"suite": "http-client", "defect": defect, "expected_failed_ids": test_ids}
    for defect, test_ids in (
        ("http_identity_equality", ["T.R15.01"]),
        ("http_missing_auth_header", ["T.R15.02"]),
        ("http_helpers_mutate", ["T.R15.03"]),
        ("http_simple_returns_response", ["T.R16.01"]),
        ("http_unquoted_path", ["T.R16.02", "T.integration.transports"]),
        ("http_flat_query_array", ["T.R16.03"]),
        ("http_wrong_json_body", ["T.R16.04"]),
        ("http_scalar_multipart_text", ["T.R16.05"]),
        ("http_wrong_binary_body", ["T.R16.06"]),
        ("http_wrong_content_type", ["T.R16.07"]),
        ("http_async_uses_sync", ["T.R16.08"]),
        ("http_raw_model_response", ["T.R16.09"]),
        ("http_ignore_unexpected_status", ["T.R16.10"]),
        ("http_hooks_skipped", ["T.R17.01"]),
        ("http_override_ignored", ["T.R17.02"]),
        ("http_prefix_ignored", ["T.R17.03"]),
    )
]


CLIENT = dedent('''
    from __future__ import annotations
    from dataclasses import dataclass, field, replace
    import httpx

    @dataclass
    class Client:
        base_url: str
        raise_on_unexpected_status: bool = False
        _headers: dict = field(default_factory=dict)
        _cookies: dict = field(default_factory=dict)
        _timeout: object = 5.0
        _httpx: object = field(default=None, compare=False, repr=False)
        _async_httpx: object = field(default=None, compare=False, repr=False)

        def _request_headers(self):
            headers = dict(self._headers)
            if isinstance(self, AuthenticatedClient):
                headers[self.auth_header_name] = f"{self.prefix} {self.token}"
            return headers

        def set_httpx_client(self, client):
            self._httpx = client

        def get_httpx_client(self):
            if self._httpx is None:
                self._httpx = httpx.Client(base_url=self.base_url, headers=self._request_headers(), cookies=self._cookies, timeout=self._timeout)
            return self._httpx

        def set_async_httpx_client(self, client):
            self._async_httpx = client

        def get_async_httpx_client(self):
            if self._async_httpx is None:
                self._async_httpx = httpx.AsyncClient(base_url=self.base_url, headers=self._request_headers(), cookies=self._cookies, timeout=self._timeout)
            return self._async_httpx

        def with_headers(self, headers):
            return replace(self, _headers={**self._headers, **headers}, _httpx=None, _async_httpx=None)

        def with_cookies(self, cookies):
            return replace(self, _cookies={**self._cookies, **cookies}, _httpx=None, _async_httpx=None)

        def with_timeout(self, timeout):
            return replace(self, _timeout=timeout, _httpx=None, _async_httpx=None)

    @dataclass(kw_only=True)
    class AuthenticatedClient(Client):
        token: str
        prefix: str = "Bearer"
        auth_header_name: str = "Authorization"
''').lstrip()


def _model(name, fields, *, imports="", names=None, decoders=None, methods=""):
    source = ("from __future__ import annotations\nfrom dataclasses import dataclass\n"
              "from ..types import File, UNSET, Unset\nfrom ._support import Model\n" + imports +
              f"\n@dataclass\nclass {name}(Model):\n")
    source += "\n".join("    " + field for field in fields) + "\n"
    if names:
        source += f"    _json_names = {names!r}\n"
    if decoders:
        source += "    _decoders = {" + ", ".join(f"{key!r}: {value}" for key, value in decoders.items()) + "}\n"
    if methods:
        source += "\n" + "\n".join("    " + line for line in dedent(methods).strip().splitlines()) + "\n"
    return source


def _enum(name, values, literal=False):
    if literal:
        return "from typing import Literal\n" + name + " = Literal[" + ", ".join(repr(value) for value in values) + "]\n"
    return "from enum import Enum\n\nclass " + name + "(str, Enum):\n" + "".join(f"    {value.upper()} = {value!r}\n" for value in values)


def _endpoint(signature, arguments, request_code, response_code, imports=""):
    source = ("from __future__ import annotations\nfrom http import HTTPStatus\nfrom urllib.parse import quote\n"
              "from ...types import Response, UNSET, Unset\nfrom ...errors import UnexpectedStatus\n" + imports + "\n")
    source += f"def _kwargs(*, {signature}):\n" if signature else "def _kwargs():\n"
    source += "\n".join("    " + line for line in dedent(request_code).strip().splitlines()) + "\n\n"
    source += "def _parse(client, response):\n"
    source += "\n".join("    " + line for line in dedent(response_code).strip().splitlines()) + "\n"
    source += "    if client.raise_on_unexpected_status:\n        raise UnexpectedStatus(response.status_code, response.content)\n    return None\n\n"
    source += "def _response(client, response):\n    return Response(status_code=HTTPStatus(response.status_code), content=response.content, headers=response.headers, parsed=_parse(client, response))\n\n"
    public_signature = "client" + (", " + signature if signature else "")
    forwarded = "client=client" + (", " + arguments if arguments else "")
    source += (f"def sync_detailed(*, {public_signature}):\n"
               f"    response = client.get_httpx_client().request(**_kwargs({arguments}))\n"
               "    return _response(client, response)\n\n"
               f"def sync(*, {public_signature}):\n"
               f"    return sync_detailed({forwarded}).parsed\n\n"
               f"async def asyncio_detailed(*, {public_signature}):\n"
               f"    response = await client.get_async_httpx_client().request(**_kwargs({arguments}))\n"
               "    return _response(client, response)\n\n"
               f"async def asyncio(*, {public_signature}):\n"
               f"    return (await asyncio_detailed({forwarded})).parsed\n")
    return source


def _http_files():
    files = source_files("empty")
    files["client.py"] = CLIENT
    files.update({
        "models/record.py": _model("Record", ["record_id: int", "name: str"], names={"record_id": "recordId"}),
        "models/error_detail.py": _model("ErrorDetail", ["message: str"]),
        "models/state.py": _enum("State", ["ready", "waiting"]),
        "models/json_body.py": _model("JsonBody", ["label_name: str", "optional_note: str | Unset = UNSET"],
                                      names={"label_name": "labelName", "optional_note": "optionalNote"}),
        "models/multipart_body.py": _model("MultipartBody", ["upload_file: File", "title: str"],
                                           names={"upload_file": "uploadFile"}, methods='''
            def to_multipart(self):
                return [("uploadFile", self.upload_file.to_tuple()), ("title", (None, self.title.encode(), "text/plain"))]
        '''),
        "models/form_body.py": _model("FormBody", ["display_name: str"], names={"display_name": "displayName"}),
        "models/__init__.py": ("from .record import Record\nfrom .error_detail import ErrorDetail\n"
                               "from .state import State\nfrom .json_body import JsonBody\n"
                               "from .multipart_body import MultipartBody\nfrom .form_body import FormBody\n"),
        "api/transport/__init__.py": "", "api/default/__init__.py": "",
    })
    imports = "from ...models.record import Record\nfrom ...models.error_detail import ErrorDetail\n"
    files["api/transport/create_record.py"] = _endpoint(
        "record_key, state, ids, body, note=UNSET", "record_key=record_key, state=state, ids=ids, body=body, note=note",
        '''
        params = {"state": state.value, "ids": ids}
        if not isinstance(note, Unset):
            params["note"] = note
        return {"method": "post", "url": "/records/" + quote(str(record_key), safe=""), "params": params,
                "json": body.to_dict(), "headers": {"Content-Type": "application/json"}}
        ''',
        '''
        if response.status_code == 201:
            return Record.from_dict(response.json())
        if response.status_code == 400:
            return ErrorDetail.from_dict(response.json())
        ''', imports)
    files["api/default/list_records.py"] = _endpoint("", "", 'return {"method": "get", "url": "/records"}',
        '''
        if response.status_code == 200:
            return [Record.from_dict(item) for item in response.json()]
        ''', imports)
    for name, method, path, media, keyword, value in (
        ("upload_record", "post", "/upload", "multipart/form-data", "files", "body.to_multipart()"),
        ("submit_form", "post", "/form", "application/x-www-form-urlencoded", "data", "body.to_dict()"),
        ("send_binary", "put", "/binary", "application/octet-stream", "content", "body"),
    ):
        files[f"api/transport/{name}.py"] = _endpoint("body", "body=body",
            f'return {{"method": {method!r}, "url": {path!r}, {keyword!r}: {value}, "headers": ' + repr({"Content-Type": media}) + "}",
            '''
            if response.status_code == 200:
                return Record.from_dict(response.json())
            ''', imports)
    return files


def _config_files(config, defect):
    files = source_files("empty")
    files["client.py"] = CLIENT
    override = {} if defect == "http_override_ignored" else config.get("class_overrides", {}).get("Payload", {})
    class_name, module_name = override.get("class_name", "Payload"), override.get("module_name", "payload")
    prefix = "field_" if defect == "http_prefix_ignored" else config.get("field_prefix", "field_")
    literal = config.get("literal_enums", False)
    decoder = "literal_mode" if literal else "Mode"
    imports = "from .mode import Mode\n"
    if literal:
        imports += '\ndef literal_mode(value):\n    if value not in ("ready", "waiting"):\n        raise TypeError("invalid literal mode")\n    return value\n'
    files[f"models/{module_name}.py"] = _model(class_name,
        [f"{prefix}3value: str", f"{prefix}_secret: int", "mode: Mode | Unset = UNSET"], imports=imports,
        names={f"{prefix}3value": "3value", f"{prefix}_secret": "_secret"}, decoders={"mode": decoder})
    files["models/mode.py"] = _enum("Mode", ["ready", "waiting"], literal)
    files["models/envelope.py"] = _model("Envelope", [f"payload: {class_name}"],
        imports=f"from .{module_name} import {class_name}\n", decoders={"payload": f"{class_name}.from_dict"})
    files["models/inline_holder_inline_choice.py"] = _enum("InlineHolderInlineChoice", ["yes", "no"], literal)
    inline_imports = "from .inline_holder_inline_choice import InlineHolderInlineChoice\n"
    if literal:
        inline_imports += '\ndef inline_value(value):\n    if value not in ("yes", "no"):\n        raise TypeError("invalid literal inline choice")\n    return value\n'
    files["models/inline_holder.py"] = _model("InlineHolder", ["inline_choice: InlineHolderInlineChoice"],
        imports=inline_imports, names={"inline_choice": "inlineChoice"},
        decoders={"inline_choice": "inline_value" if literal else "InlineHolderInlineChoice"})
    files["models/echo_payload_body.py"] = _model("EchoPayloadBody", ["message: str"])
    files["models/__init__.py"] = (f"from .{module_name} import {class_name}\nfrom .envelope import Envelope\n"
                                  "from .mode import Mode\nfrom .inline_holder_inline_choice import InlineHolderInlineChoice\n"
                                  "from .inline_holder import InlineHolder\nfrom .echo_payload_body import EchoPayloadBody\n")
    files["api/config/__init__.py"] = ""
    files["api/config/echo_payload.py"] = _endpoint("body", "body=body",
        'return {"method": "post", "url": "/echo", "json": body.to_dict(), "headers": {"Content-Type": "application/json"}}',
        '''
        if response.status_code == 200:
            return Envelope.from_dict(response.json())
        ''', "from ...models.envelope import Envelope\nfrom ...models.echo_payload_body import EchoPayloadBody\n")
    return files


MUTATIONS = {
    "http_identity_equality": ("client.py", "@dataclass\nclass Client:", "@dataclass(eq=False)\nclass Client:"),
    "http_missing_auth_header": ("client.py", 'headers[self.auth_header_name] = f"{self.prefix} {self.token}"', "pass"),
    "http_helpers_mutate": ("client.py", "return replace(self, _headers={**self._headers, **headers}, _httpx=None, _async_httpx=None)", "self._headers.update(headers)\n        return self"),
    "http_simple_returns_response": ("api/transport/create_record.py", "return sync_detailed(client=client, record_key=record_key, state=state, ids=ids, body=body, note=note).parsed", "return sync_detailed(client=client, record_key=record_key, state=state, ids=ids, body=body, note=note)"),
    "http_unquoted_path": ("api/transport/create_record.py", 'quote(str(record_key), safe="")', "str(record_key)"),
    "http_flat_query_array": ("api/transport/create_record.py", '"ids": ids', '"ids": ",".join(str(item) for item in ids)'),
    "http_wrong_json_body": ("api/transport/create_record.py", '"json": body.to_dict()', '"json": {"wrong": "json payload"}'),
    "http_scalar_multipart_text": ("models/multipart_body.py", "self.title.encode()", "self.title"),
    "http_wrong_binary_body": ("api/transport/send_binary.py", "'content': body", "'content': b'wrong binary body'"),
    "http_wrong_content_type": ("api/transport/submit_form.py", "'application/x-www-form-urlencoded'", "'text/plain'"),
    "http_async_uses_sync": ("api/transport/create_record.py", "await client.get_async_httpx_client().request", "client.get_httpx_client().request"),
    "http_raw_model_response": ("api/transport/create_record.py", "return Record.from_dict(response.json())", "return response.json()"),
    "http_ignore_unexpected_status": ("api/transport/create_record.py", "if client.raise_on_unexpected_status:", "if False:"),
}


def build_control_files(document, config, defect):
    title = document.get("info", {}).get("title")
    if title == "Public HTTP":
        files = _http_files()
    elif title == "Public HTTP Config":
        files = _config_files(config or {}, defect)
    else:
        return None
    if defect in MUTATIONS:
        name, before, after = MUTATIONS[defect]
        if name in files:
            if before not in files[name]:
                raise ValueError(f"HTTP control defect did not match its template: {defect}")
            files[name] = files[name].replace(before, after)
    return files
