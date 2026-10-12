"""Finite, independent authored model controls for the two D065 public fixtures.

This is not a general OpenAPI generator or a product candidate. It emits fixed
public examples and named semantic faults without importing the checker, previous
candidates, or a hidden grader.
"""
from textwrap import dedent

from templates import source_files


_COMMON = """\
from __future__ import annotations
from dataclasses import dataclass
from ._support import Model
"""


def _model(name, fields, imports="", extra=""):
    body = "\n".join("    " + line for line in fields.splitlines())
    return _COMMON + imports + "\n@dataclass\nclass " + name + "(Model):\n" + body + "\n" + extra


def _endpoint(single=False):
    """Emit only the fixed public operation signatures/docstrings for this control."""
    description = "Read the public status." if single else "Upload a public item."
    returns = "ThingA" if single else "ThingA | ThingB"
    text = ("from __future__ import annotations\n"
            "from ...types import UNSET, Unset, Response\n"
            "from ...models.thing_a import ThingA\n"
            "from ...models.thing_b import ThingB\n"
            "from ...models.upload_thing_body import UploadThingBody\n\n")
    arguments = "client" if single else "client, item_id: str, body: UploadThingBody, search_term: str | Unset = UNSET"
    for name in ("sync", "sync_detailed", "asyncio", "asyncio_detailed"):
        annotation = "Response[" + returns + "]" if name.endswith("_detailed") else returns
        text += ("async " if name.startswith("asyncio") else "") + f"def {name}(*, {arguments}) -> {annotation}:\n"
        text += f'    """{description}\n\n'
        if not single:
            text += ("    Args:\n"
                     "        item_id (str): The item identifier.\n"
                     "        search_term (str | Unset):\n"
                     "        body (UploadThingBody): The item body.\n\n")
        text += f'    Returns:\n        {annotation}: Public result.\n    """\n    return None\n\n'
    return text


def _model_files():
    files = source_files("empty")
    support = files["models/_support.py"]
    support = support.replace("    _decoders = {}\n", "    _decoders = {}\n    _additional_decoder = staticmethod(lambda value: value)\n    _allow_additional = True\n")
    support = support.replace(
        "result.additional_properties = {key: value for key, value in data.items() if key not in known}",
        "result.additional_properties = {key: cls._additional_decoder(value) for key, value in data.items() if key not in known} if cls._allow_additional else {}")
    support = support.replace("result = dict(self.additional_properties)", "result = {key: encode(value) for key, value in self.additional_properties.items()}")
    files["models/_support.py"] = support
    files.update({
        "models/thing_a.py": _model("ThingA", "alpha: str"),
        "models/thing_b.py": _model("ThingB", "beta: int"),
        "models/named_object.py": _model("NamedObject", "label: str"),
        "models/named_state.py": 'from enum import Enum\n\nclass NamedState(str, Enum):\n    READY = "ready"\n    WAITING = "waiting"\n',
        "models/my_model_inline_object_prop.py": _model("MyModelInlineObjectProp", 'inner_code: int\n_json_names = {"inner_code": "innerCode"}'),
        "models/my_model_inline_enum_prop.py": 'from enum import Enum\n\nclass MyModelInlineEnumProp(str, Enum):\n    FIRST = "first"\n    SECOND = "second"\n',
        "models/my_model.py": _model("MyModel", dedent('''\
            string_prop: str
            inline_object_prop: MyModelInlineObjectProp
            inline_enum_prop: MyModelInlineEnumProp
            _json_names = {"string_prop": "stringProp", "inline_object_prop": "inlineObjectProp", "inline_enum_prop": "inlineEnumProp"}
            _decoders = {"inline_object_prop": MyModelInlineObjectProp.from_dict, "inline_enum_prop": MyModelInlineEnumProp}
        ''').rstrip(), "from .my_model_inline_object_prop import MyModelInlineObjectProp\nfrom .my_model_inline_enum_prop import MyModelInlineEnumProp\n"),
        "models/upload_thing_body.py": _model("UploadThingBody", 'body_value: str\n_json_names = {"body_value": "bodyValue"}'),
        "models/ref_probe.py": _model("RefProbe", 'chained: ThingA\nday: datetime.date\n_decoders = {"chained": ThingA.from_dict, "day": datetime.date.fromisoformat}', "import datetime\nfrom .thing_a import ThingA\n"),
        "models/base_record.py": _model("BaseRecord", 'base_name: str\n_json_names = {"base_name": "baseName"}'),
        "models/merged_record.py": _model("MergedRecord", 'base_name: str\nextra_count: int\n_json_names = {"base_name": "baseName", "extra_count": "extraCount"}'),
        "models/open_record.py": _model("OpenRecord", "label: str"),
        "models/typed_record.py": _model("TypedRecord", "label: str\n_additional_decoder = ThingA.from_dict", "from .thing_a import ThingA\n"),
        "models/closed_record.py": _model("ClosedRecord", "label: str\n_allow_additional = False"),
        "models/nullable_state.py": 'from enum import Enum\n\nclass NullableState(str, Enum):\n    ACTIVE = "active"\n    PAUSED = "paused"\n',
        "models/nullable_probe.py": _model("NullableProbe", dedent('''\
            via_one_of: NamedState | None
            via_type_list: NullableState | None
            only_null: None
            _json_names = {"via_one_of": "viaOneOf", "via_type_list": "viaTypeList", "only_null": "onlyNull"}
            _decoders = {"via_one_of": lambda value: None if value is None else NamedState(value), "via_type_list": lambda value: None if value is None else NullableState(value)}
        ''').rstrip(), "from .named_state import NamedState\nfrom .nullable_state import NullableState\n"),
        "models/_schema_support.py": dedent('''\
            from collections.abc import Mapping
            from .thing_a import ThingA
            from .thing_b import ThingB

            def choose(value):
                if isinstance(value, Mapping):
                    if "alpha" in value:
                        return ThingA.from_dict(value)
                    if "beta" in value:
                        return ThingB.from_dict(value)
                    raise TypeError("object has no matching required property")
                return value

            def choose_list(value):
                return [choose(item) for item in value]
        '''),
        "models/union_probe.py": _model("UnionProbe", dedent('''\
            direct_one: ThingA | ThingB
            via_ref: ThingA | ThingB
            via_wrapper: ThingA | ThingB | str | int
            direct_any: str | int
            multi: str | int
            nullable: int | None
            thing: ThingA | ThingB | Unset = UNSET
            optional_any: str | int | Unset = UNSET
            _json_names = {"direct_one": "directOne", "via_ref": "viaRef", "via_wrapper": "viaWrapper", "direct_any": "directAny", "optional_any": "optionalAny"}
            _decoders = {"direct_one": choose, "via_ref": choose, "via_wrapper": choose, "thing": choose}
        ''').rstrip(), "from ..types import UNSET, Unset\nfrom .thing_a import ThingA\nfrom .thing_b import ThingB\nfrom ._schema_support import choose\n"),
        "models/prefix_probe.py": _model("PrefixProbe", dedent('''\
            prefix_only: list[ThingA | str]
            prefix_tail: list[ThingA | str | int]
            nested_only: list[ThingA | ThingB | str | int | bool]
            nested_tail: list[ThingA | ThingB | str | int | bool | float]
            _json_names = {"prefix_only": "prefixOnly", "prefix_tail": "prefixTail", "nested_only": "nestedOnly", "nested_tail": "nestedTail"}
            _decoders = {"prefix_only": choose_list, "prefix_tail": choose_list, "nested_only": choose_list, "nested_tail": choose_list}
        ''').rstrip(), "from .thing_a import ThingA\nfrom .thing_b import ThingB\nfrom ._schema_support import choose_list\n"),
        "api/widgets/__init__.py": "",
        "api/default/__init__.py": "",
        "api/widgets/upload_thing.py": _endpoint(),
        "api/default/read_status.py": _endpoint(single=True),
    })
    exports = [("thing_a", "ThingA"), ("thing_b", "ThingB"), ("named_object", "NamedObject"),
               ("named_state", "NamedState"), ("my_model_inline_object_prop", "MyModelInlineObjectProp"),
               ("my_model_inline_enum_prop", "MyModelInlineEnumProp"), ("my_model", "MyModel"),
               ("upload_thing_body", "UploadThingBody"), ("ref_probe", "RefProbe"),
               ("base_record", "BaseRecord"), ("merged_record", "MergedRecord"),
               ("open_record", "OpenRecord"), ("typed_record", "TypedRecord"), ("closed_record", "ClosedRecord"),
               ("nullable_state", "NullableState"), ("nullable_probe", "NullableProbe"),
               ("union_probe", "UnionProbe"), ("prefix_probe", "PrefixProbe")]
    files["models/__init__.py"] = "".join(f"from .{module} import {name}\n" for module, name in exports)
    return files


def _literal_files():
    files = source_files("empty")
    files.update({
        "models/state_enum.py": 'from typing import Literal\nStateEnum = Literal["open", "closed"]\n',
        "models/rank_enum.py": "from typing import Literal\nRankEnum = Literal[2, 5]\n",
        "models/literal_probe.py": _model("LiteralProbe", dedent('''\
            state: StateEnum
            rank: RankEnum
            _decoders = {"state": decode_state, "rank": decode_rank}
        ''').rstrip(), dedent('''\
            from .state_enum import StateEnum
            from .rank_enum import RankEnum

            def decode_state(value):
                if type(value) is not str or value not in ("open", "closed"):
                    raise TypeError("invalid string literal")
                return value

            def decode_rank(value):
                if type(value) is not int or value not in (2, 5):
                    raise TypeError("invalid integer literal")
                return value
        ''')),
        "models/__init__.py": "from .state_enum import StateEnum\nfrom .rank_enum import RankEnum\nfrom .literal_probe import LiteralProbe\n",
    })
    return files


_MUTATIONS = {
    "models_named_class_export": ("models/__init__.py", "from .named_object import NamedObject\n", "from .named_object import NamedObject as WrongNamedObject\n"),
    "models_inline_class_export": ("models/__init__.py", "from .my_model_inline_enum_prop import MyModelInlineEnumProp\n", "from .my_model_inline_enum_prop import MyModelInlineEnumProp as WrongInlineName\n"),
    "models_inline_body_export": ("models/__init__.py", "from .upload_thing_body import UploadThingBody\n", "from .upload_thing_body import UploadThingBody as WrongBodyName\n"),
    "models_parameter_camelcase": ("api/widgets/upload_thing.py", "search_term", "searchTerm"),
    "models_chain_raw": ("models/ref_probe.py", '"chained": ThingA.from_dict', '"chained": lambda value: value'),
    "models_allof_loses_base": ("models/merged_record.py", "    base_name: str\n", ""),
    "models_typed_additional_raw": ("models/typed_record.py", "_additional_decoder = ThingA.from_dict", "_additional_decoder = staticmethod(lambda value: value)"),
    "models_closed_keeps_unknown": ("models/closed_record.py", "_allow_additional = False", "_allow_additional = True"),
    "models_doc_arg_missing_colon": ("api/widgets/upload_thing.py", "search_term (str | Unset):", "search_term (str | Unset)"),
    "models_doc_return_raw": ("api/widgets/upload_thing.py", "        Response[ThingA | ThingB]: Public result.", "        ThingA | ThingB: Public result."),
    "models_nullable_rejects_none": ("models/nullable_probe.py", "None if value is None else NamedState(value)", "NamedState(value)"),
    "models_literal_accepts_invalid": ("models/literal_probe.py", '_decoders = {"state": decode_state, "rank": decode_rank}', '_decoders = {}'),
    "models_union_alias_annotation": ("models/union_probe.py", "via_ref: ThingA | ThingB", "via_ref: ThingAOrB"),
    "models_union_wrong_object": ("models/_schema_support.py", "return ThingB.from_dict(value)", 'return ThingA(alpha="wrong required-key match")'),
}


def build_control_files(document, config, defect):
    title = document.get("info", {}).get("title")
    if title == "D065 Public Models":
        files = _model_files()
    elif title == "D065 Public Literals":
        if not config.get("literal_enums"):
            raise ValueError("literal control requires literal_enums: true")
        files = _literal_files()
    else:
        return None
    # A model-only fault must not turn the independent literal generation into
    # an infrastructure error just because both packages have models/__init__.py.
    mutation_applies = (title == "D065 Public Literals") == (defect == "models_literal_accepts_invalid")
    mutation = _MUTATIONS.get(defect) if mutation_applies else None
    if mutation and mutation[0] in files:
        name, before, after = mutation
        if before not in files[name]:
            raise ValueError(f"D065 model mutation did not match: {defect}")
        files[name] = files[name].replace(before, after)
    if title == "D065 Public Models":
        if defect == "models_operation_missing_package":
            del files["api/default/__init__.py"]
        elif defect == "models_prefix_ignores_items":
            files["models/prefix_probe.py"] = files["models/prefix_probe.py"].replace(
                "prefix_tail: list[ThingA | str | int]", "prefix_tail: list[ThingA | str]").replace(
                "nested_tail: list[ThingA | ThingB | str | int | bool | float]", "nested_tail: list[ThingA | ThingB | str | int | bool]")
        elif defect == "models_union_raw_encoding":
            files["models/union_probe.py"] += (
                "\n    def to_dict(self):\n"
                "        result = super().to_dict()\n"
                '        result["viaWrapper"] = self.via_wrapper\n'
                "        return result\n")
        elif defect == "models_valid_alternatives":
            # Both variations are explicitly allowed by the public source. This
            # positive contrast catches a checker that imposes union order or
            # insists closed models must ignore instead of reject unknown keys.
            for name in files:
                files[name] = files[name].replace("ThingA | ThingB", "ThingB | ThingA")
            files["models/closed_record.py"] += (
                "\n    @classmethod\n"
                "    def from_dict(cls, data):\n"
                '        if set(data) - {"label"}:\n'
                '            raise ValueError("unknown field in closed object")\n'
                "        return super().from_dict(data)\n")
    return files


CONTROL_CASES = [
    {"suite": "schema-models", "defect": defect, "expected_failed_ids": ids}
    for defect, ids in [
        ("models_operation_missing_package", ["T.R04.06"]),
        ("models_named_class_export", ["T.R05.01"]),
        ("models_inline_class_export", ["T.R05.02"]),
        ("models_inline_body_export", ["T.R05.03"]),
        ("models_parameter_camelcase", ["T.R05.04"]),
        ("models_chain_raw", ["T.R08.05"]),
        ("models_allof_loses_base", ["T.R08.06"]),
        ("models_prefix_ignores_items", ["T.R08.07", "T.integration.unions-arrays"]),
        ("models_typed_additional_raw", ["T.R09.01"]),
        ("models_closed_keeps_unknown", ["T.R09.01"]),
        ("models_doc_arg_missing_colon", ["T.R10.02"]),
        ("models_doc_return_raw", ["T.R10.03"]),
        ("models_nullable_rejects_none", ["T.R11.05"]),
        ("models_literal_accepts_invalid", ["T.R12.01"]),
        ("models_union_alias_annotation", ["T.R13.01"]),
        ("models_union_wrong_object", ["T.R13.02"]),
        ("models_union_raw_encoding", ["T.R13.03"]),
    ]
]
