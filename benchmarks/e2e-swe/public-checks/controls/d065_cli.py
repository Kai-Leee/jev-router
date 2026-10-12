"""Finite positive/negative CLI controls derived only from the public document."""
from textwrap import dedent
from templates import source_files

CONTROL_CASES = [
    {"suite": "cli-config-environment", "defect": "cli_operation_wrong_value", "expected_failed_ids": ["T.R01.01"]},
    {"suite": "cli-config-environment", "defect": "cli_entrypoint_missing", "expected_failed_ids": ["T.R01.02"]},
    {"suite": "cli-config-environment", "defect": "cli_yaml_ignored", "expected_failed_ids": ["T.R01.03", "T.R03.06"]},
    {"suite": "cli-config-environment", "defect": "cli_requires_download", "expected_failed_ids": ["T.R02.01"]},
    {"suite": "cli-config-environment", "defect": "cli_json_parser_wrong", "expected_failed_ids": ["T.R02.02"]},
    {"suite": "cli-config-environment", "defect": "cli_dependency_undeclared", "expected_failed_ids": ["T.R02.03"]},
    {"suite": "cli-config-environment", "defect": "cli_selectors_accept_both", "expected_failed_ids": ["T.R03.01"]},
    {"suite": "cli-config-environment", "defect": "cli_metadata_version_wrong", "expected_failed_ids": ["T.R18.01"]},
    {"suite": "cli-config-environment", "defect": "cli_setup_metadata_missing", "expected_failed_ids": ["T.R18.02"]},
    {"suite": "cli-config-environment", "defect": "cli_diagnostic_message_wrong", "expected_failed_ids": ["T.R19.03", "T.integration.diagnostics"]},
    {"suite": "cli-config-environment", "defect": "cli_setup_missing_flag", "expected_failed_ids": ["T.R20.01"]},
    {"suite": "cli-config-environment", "defect": "cli_suffix_ignored", "expected_failed_ids": ["T.R03.06"]},
    {"suite": "cli-config-environment", "defect": "http_override_ignored", "expected_failed_ids": ["T.R03.03", "T.integration.config-layout"]},
]


def build_control_files(document, config, defect):
    if document.get("info", {}).get("title") != "Public CLI":
        return None
    files = source_files("empty")
    files.update({
        "models/sample.py": dedent('''\
            from __future__ import annotations
            from dataclasses import dataclass
            from ._support import Model

            @dataclass
            class Sample(Model):
                value: str
        '''),
        "models/__init__.py": "from .sample import Sample\n",
        "client.py": dedent('''\
            from dataclasses import dataclass, field
            import httpx

            @dataclass
            class Client:
                base_url: str
                raise_on_unexpected_status: bool = False
                _client: object = field(default=None, init=False, repr=False, compare=False)

                def set_httpx_client(self, client):
                    self._client = client
                    return self

                def get_httpx_client(self):
                    if self._client is None:
                        self._client = httpx.Client(base_url=self.base_url)
                    return self._client

            @dataclass
            class AuthenticatedClient(Client):
                token: str = ""
                prefix: str = "Bearer"
                auth_header_name: str = "Authorization"
        '''),
        "api/default/__init__.py": "",
        "api/default/get_sample.py": dedent('''\
            from http import HTTPStatus
            from ...types import Response
            from ...models import Sample

            def sync_detailed(*, client):
                response = client.get_httpx_client().request(method="GET", url="/sample")
                parsed = Sample.from_dict(response.json())
                return Response(status_code=HTTPStatus(response.status_code), content=response.content,
                                headers=response.headers, parsed=parsed)

            def sync(*, client):
                return sync_detailed(client=client).parsed
        '''),
    })
    if defect == "cli_operation_wrong_value":
        files["api/default/get_sample.py"] = files["api/default/get_sample.py"].replace('Sample.from_dict(response.json())', 'Sample(value="wrong response")')
    return files
