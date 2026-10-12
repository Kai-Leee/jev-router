"""Executable model/schema checks derived only from the public instruction.

One shared generated package exercises compatible schema contracts. Literal enum
configuration uses a second package. Authored controls live outside this module;
neither the expected results nor these assertions import a control renderer.
"""
from __future__ import annotations

import ast
import datetime
import importlib
import inspect
import re
from typing import Literal


SUITES = {"schema-models": [
    "T.R04.06", "T.R05.01", "T.R05.02", "T.R05.03", "T.R05.04",
    "T.R08.05", "T.R08.06", "T.R08.07", "T.R09.01",
    "T.R10.02", "T.R10.03", "T.R11.05", "T.R12.01",
    "T.R13.01", "T.R13.02", "T.R13.03", "T.integration.unions-arrays",
]}


def _annotation(value):
    """Compare type spelling/structure without imposing an order on union members."""
    def visit(node):
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return visit(node.value) + "." + node.attr
        if isinstance(node, ast.Constant):
            if node.value is None:
                return "None"
            if isinstance(node.value, str):
                return _annotation(node.value)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            members = []
            for part in (visit(node.left), visit(node.right)):
                members.extend(part[1] if isinstance(part, tuple) and part[0] == "union" else [part])
            return "union", frozenset(members)
        if isinstance(node, ast.Subscript):
            return "subscript", visit(node.value), visit(node.slice)
        raise ValueError("unsupported public annotation structure")
    return visit(ast.parse(value, mode="eval").body)


def _check_annotation(c, cls, name, expected):
    value = cls.__annotations__.get(name)
    c.require(isinstance(value, str), f"{cls.__name__}.{name} has a class-level string annotation")
    c.equal(_annotation(value), _annotation(expected), f"{cls.__name__}.{name} member types")


def _sections(c, function, description):
    doc = inspect.getdoc(function)
    c.require(isinstance(doc, str) and doc.startswith(description), "operation description starts function docstring")
    result = {}
    current = None
    lines = doc.splitlines()
    for index, line in enumerate(lines):
        match = re.fullmatch(r"([A-Za-z]+):", line.strip())
        if match:
            c.require(index == 0 or not lines[index - 1].strip(), "Google sections are separated by blank lines")
            current = match.group(1)
            result[current] = []
        elif current and line.strip():
            result[current].append(line.strip())
    return result


def schema_model_checks(h, c):
    pkg, directory = h.generate("d065-models.json", "generated_d065_models")
    module = lambda suffix: importlib.import_module(pkg.__name__ + suffix)
    models = module(".models")
    types = module(".types")
    endpoint = lambda: module(".api.widgets.upload_thing")
    functions = ("sync", "sync_detailed", "asyncio", "asyncio_detailed")
    naming_data = {"stringProp": "public", "inlineObjectProp": {"innerCode": 7}, "inlineEnumProp": "first"}

    def operation_layout():
        for name in ("api/__init__.py", "api/widgets/__init__.py", "api/default/__init__.py",
                     "api/widgets/upload_thing.py", "api/default/read_status.py"):
            c.require((directory / name).is_file(), f"operation package/module exists: {name}")
        for suffix in (".api.widgets.upload_thing", ".api.default.read_status"):
            operation = module(suffix)
            c.require(all(callable(getattr(operation, name, None)) for name in functions), "operation module imports and exports endpoint functions")

    def named_boundaries():
        for name, filename in (("NamedObject", "named_object"), ("NamedState", "named_state")):
            c.require((directory / "models" / (filename + ".py")).is_file(), f"named schema module {filename}")
            c.require(hasattr(models, name), f"named schema export {name}")
            cls = getattr(models, name)
            c.require(inspect.isclass(cls) and cls.__name__ == name, f"PascalCase generated class {name}")
            c.require(getattr(module(".models." + filename), name) is cls, "schema class re-export identity")
        c.equal(models.NamedObject.from_dict({"label": "named"}).to_dict(), {"label": "named"}, "named object is usable")
        c.equal(models.NamedState("ready").value, "ready", "named enum is usable")
        for field, expected in (("via_ref", "ThingA | ThingB"), ("optional_any", "str | int | Unset"),
                                ("multi", "str | int")):
            _check_annotation(c, models.UnionProbe, field, expected)

    def inline_properties():
        for name, filename in (("MyModelInlineObjectProp", "my_model_inline_object_prop"),
                               ("MyModelInlineEnumProp", "my_model_inline_enum_prop")):
            c.require((directory / "models" / (filename + ".py")).is_file(), f"inline schema module {filename}")
            c.require(hasattr(models, name), f"inline schema class export {name}")
            c.equal(getattr(models, name).__name__, name, "inline class name includes the owning model and property")
            c.require(getattr(module(".models." + filename), name) is getattr(models, name), "inline class re-export identity")
        value = models.MyModel.from_dict(naming_data)
        c.require(type(value.inline_object_prop) is models.MyModelInlineObjectProp, "inline object becomes its generated class")
        c.require(type(value.inline_enum_prop) is models.MyModelInlineEnumProp, "inline enum becomes its generated class")
        c.equal(value.to_dict(), naming_data, "inline object and enum round trip")

    def inline_body():
        c.require((directory / "models" / "upload_thing_body.py").is_file(), "inline body module uses operationId plus Body")
        c.require(hasattr(models, "UploadThingBody"), "inline body exports UploadThingBody")
        cls = module(".models.upload_thing_body").UploadThingBody
        c.equal(cls.__name__, "UploadThingBody", "inline body class name includes the operationId and Body suffix")
        c.require(cls is models.UploadThingBody, "body class re-export")
        c.equal(cls.from_dict({"bodyValue": "payload"}).to_dict(), {"bodyValue": "payload"}, "inline body model round trip")
        for name in functions:
            body = inspect.signature(getattr(endpoint(), name)).parameters["body"]
            c.require("UploadThingBody" in str(body.annotation), "endpoint body names its generated inline model")

    def property_parameter_names():
        value = models.MyModel.from_dict(naming_data)
        c.equal(value.string_prop, "public", "camelCase JSON property uses snake_case attribute")
        c.equal(value.to_dict(), naming_data, "original camelCase JSON keys survive serialization")
        for name in functions:
            parameters = inspect.signature(getattr(endpoint(), name)).parameters
            c.require("item_id" in parameters and "search_term" in parameters, "operation parameter keywords use snake_case")
            c.require("itemId" not in parameters and "searchTerm" not in parameters, "operation does not retain camelCase Python keywords")

    def reference_chains():
        data = {"chained": {"alpha": "resolved"}, "day": "2021-06-04"}
        value = models.RefProbe.from_dict(data)
        c.require(type(value.chained) is models.ThingA, "object ref chain reaches final concrete class")
        c.equal(value.day, datetime.date(2021, 6, 4), "scalar ref chain preserves date conversion")
        _check_annotation(c, models.RefProbe, "chained", "ThingA")
        _check_annotation(c, models.RefProbe, "day", "datetime.date")
        c.equal(value.to_dict(), data, "ref chain encodes concrete object/date types")

    def allof_merging():
        cls = models.MergedRecord
        data = {"baseName": "base", "extraCount": 9}
        _check_annotation(c, cls, "base_name", "str")
        _check_annotation(c, cls, "extra_count", "int")
        value = cls.from_dict(data)
        c.equal((value.base_name, value.extra_count), ("base", 9), "allOf contains base and added properties")
        c.equal(cls(base_name="base", extra_count=9).to_dict(), data, "merged class constructor and serialization")
        c.raises(KeyError, lambda: cls.from_dict({"extraCount": 9}), "merged base required key retained")
        c.raises(KeyError, lambda: cls.from_dict({"baseName": "base"}), "merged extra required key retained")

    def prefix_data(member=None):
        if member is None:
            member = {"alpha": "nested"}
        return {"prefixOnly": [{"alpha": "first"}, "tail"],
                "prefixTail": [{"alpha": "first"}, "tail", 4],
                "nestedOnly": [member, True], "nestedTail": [member, False, 2.5]}

    def prefix_items():
        _check_annotation(c, models.PrefixProbe, "prefix_only", "list[ThingA | str]")
        _check_annotation(c, models.PrefixProbe, "prefix_tail", "list[ThingA | str | int]")
        data = prefix_data()
        value = models.PrefixProbe.from_dict(data)
        c.require(type(value.prefix_only) is list and type(value.prefix_tail) is list, "prefixItems decode as lists")
        c.require(type(value.prefix_only[0]) is models.ThingA and type(value.prefix_tail[0]) is models.ThingA, "prefix object item conversion")
        c.equal(value.prefix_only[1], "tail", "prefix scalar item preserved")
        c.require(type(value.prefix_tail[2]) is int and value.prefix_tail[2] == 4, "additional items integer preserved")
        c.equal(value.to_dict(), data, "both prefixItems variants round trip")

    def additional_properties():
        for cls in (models.OpenRecord, models.TypedRecord, models.ClosedRecord):
            c.require("additional_properties" not in inspect.signature(cls).parameters, "additional properties excluded from model constructor")
            c.equal(cls.from_dict({"label": "known"}).to_dict(), {"label": "known"}, "known property remains usable")
        free = models.OpenRecord.from_dict({"label": "free", "extra": {"arbitrary": [1, None]}})
        c.equal(free.additional_properties, {"extra": {"arbitrary": [1, None]}}, "unspecified additional properties stay raw")
        c.equal(free.to_dict()["extra"], {"arbitrary": [1, None]}, "raw additional property serializes")
        typed = models.TypedRecord.from_dict({"label": "typed", "extra": {"alpha": "converted"}})
        c.require(type(typed.additional_properties["extra"]) is models.ThingA, "typed additional property schema is decoded")
        c.equal(typed.to_dict(), {"label": "typed", "extra": {"alpha": "converted"}}, "typed additional property is encoded")
        try:
            closed = models.ClosedRecord.from_dict({"label": "closed", "extra": 5})
        except Exception:
            # The public contract permits rejection or ignoring; it does not
            # prescribe an exception class for additionalProperties:false.
            c.require(True, "closed model rejects an unknown key")
        else:
            c.require("extra" not in getattr(closed, "additional_properties", {}), "closed model does not store unknown key")
            c.equal(closed.to_dict(), {"label": "closed"}, "closed model omits ignored key")

    def argument_docstrings():
        expected = {"item_id": ("str", "The item identifier."),
                    "search_term": ("str | Unset", ""), "body": ("UploadThingBody", "The item body.")}
        for name in functions:
            sections = _sections(c, getattr(endpoint(), name), "Upload a public item.")
            c.require("Args" in sections, f"{name} has Args section")
            parsed = {}
            for line in sections["Args"]:
                match = re.fullmatch(r"([a-zA-Z_][a-zA-Z_0-9]*)\s+\((.+)\):(?:\s+(.*))?", line)
                c.require(match is not None, "each Args entry has name (type): and a colon even without description")
                c.require(match.group(1) not in parsed, "one Args entry per parameter/body")
                parsed[match.group(1)] = (match.group(2), match.group(3) or "")
            c.equal(set(parsed), set(expected), "Args contains every parameter/body and excludes client")
            for field, (annotation, description) in expected.items():
                c.equal(_annotation(parsed[field][0]), _annotation(annotation), f"Args type for {field}")
                c.equal(parsed[field][1], description, f"Args description for {field}")

    def return_docstrings():
        for operation, description, parsed_type in ((endpoint(), "Upload a public item.", "ThingA | ThingB"),
                (module(".api.default.read_status"), "Read the public status.", "ThingA")):
            for name in functions:
                sections = _sections(c, getattr(operation, name), description)
                c.require("Returns" in sections and bool(sections["Returns"]), f"{name} has nonempty Returns section")
                documented = sections["Returns"][0].split(":", 1)[0].strip()
                expected = f"Response[{parsed_type}]" if name.endswith("_detailed") else parsed_type
                c.equal(_annotation(documented), _annotation(expected), f"{name} documents its parsed/Response type")

    def nullable_enums():
        cls = models.NullableProbe
        for field, annotation in (("via_one_of", "NamedState | None"), ("via_type_list", "NullableState | None"), ("only_null", "None")):
            _check_annotation(c, cls, field, annotation)
        empty = {"viaOneOf": None, "viaTypeList": None, "onlyNull": None}
        value = cls.from_dict(empty)
        c.require(value.via_one_of is None and value.via_type_list is None and value.only_null is None, "nullable and null-only enums accept None")
        c.equal(value.to_dict(), empty, "nullable enum None round trip")
        populated = {"viaOneOf": "ready", "viaTypeList": "active", "onlyNull": None}
        value = cls.from_dict(populated)
        c.require(type(value.via_one_of) is models.NamedState and type(value.via_type_list) is models.NullableState, "nonnull values remain enum members")
        c.equal(value.to_dict(), populated, "nonnull nullable enum round trip")

    def literal_enums():
        literal_pkg, _ = h.generate("d065-models-literals.json", "generated_d065_literals", config={"literal_enums": True})
        literal = importlib.import_module(literal_pkg.__name__ + ".models")
        c.equal(literal.StateEnum, Literal["open", "closed"], "string enum is a typing.Literal alias")
        c.equal(literal.RankEnum, Literal[2, 5], "integer enum is a typing.Literal alias")
        value = literal.LiteralProbe.from_dict({"state": "open", "rank": 5})
        c.require(type(value.state) is str and type(value.rank) is int, "literal enum model stores raw values")
        c.equal(value.to_dict(), {"state": "open", "rank": 5}, "literal values round trip")
        c.raises(TypeError, lambda: literal.LiteralProbe.from_dict({"state": "invalid", "rank": 2}), "invalid string literal rejects with TypeError")
        c.raises(TypeError, lambda: literal.LiteralProbe.from_dict({"state": "open", "rank": 9}), "invalid integer literal rejects with TypeError")

    def union_annotations():
        for name, expected in (("direct_one", "ThingA | ThingB"), ("via_ref", "ThingA | ThingB"),
                ("via_wrapper", "ThingA | ThingB | str | int"), ("direct_any", "str | int"),
                ("multi", "str | int"), ("nullable", "int | None"),
                ("thing", "ThingA | ThingB | Unset"), ("optional_any", "str | int | Unset")):
            _check_annotation(c, models.UnionProbe, name, expected)

    def union_data(member, object_member=None):
        return {"directOne": {"alpha": "first"} if object_member is None else object_member,
                "viaRef": {"beta": 7}, "viaWrapper": member, "directAny": "text", "multi": 4, "nullable": None}

    def union_matching():
        for raw, target in (({"alpha": "a"}, models.ThingA), ({"beta": 8}, models.ThingB), ("scalar", str), (3, int)):
            value = models.UnionProbe.from_dict(union_data(raw))
            c.require(type(value.direct_one) is models.ThingA and type(value.via_ref) is models.ThingB, "required keys distinguish union object members")
            c.require(type(value.via_wrapper) is target, "nested referenced union selects concrete shape/type")
            c.require(value.thing is types.UNSET and value.optional_any is types.UNSET, "optional referenced unions retain UNSET")
            c.equal(value.to_dict(), union_data(raw), "selected union members round trip")
        swapped = models.UnionProbe.from_dict(union_data({"beta": 5}, {"beta": 6}))
        c.require(type(swapped.direct_one) is models.ThingB, "direct oneOf chooses second required-key member")

    def union_encoding():
        for member, encoded in ((models.ThingA(alpha="object"), {"alpha": "object"}),
                                (models.ThingB(beta=6), {"beta": 6}), ("scalar", "scalar"), (3, 3)):
            value = models.UnionProbe(direct_one=models.ThingA(alpha="first"), via_ref=models.ThingB(beta=7),
                                     via_wrapper=member, direct_any="text", multi=4, nullable=None)
            c.equal(value.to_dict(), union_data(encoded), "concrete object/scalar value controls union encoding")

    def combined_unions_arrays():
        _check_annotation(c, models.PrefixProbe, "nested_only", "list[ThingA | ThingB | str | int | bool]")
        _check_annotation(c, models.PrefixProbe, "nested_tail", "list[ThingA | ThingB | str | int | bool | float]")
        for raw, target in (({"alpha": "a"}, models.ThingA), ({"beta": 9}, models.ThingB), ("nested", str), (4, int)):
            data = prefix_data(raw)
            value = models.PrefixProbe.from_dict(data)
            c.require(type(value.nested_only) is list and type(value.nested_tail) is list, "nested referenced union arrays are lists")
            c.require(type(value.nested_only[0]) is target and type(value.nested_tail[0]) is target, "array union uses required keys and scalar shape")
            c.require(type(value.nested_only[1]) is bool and type(value.nested_tail[2]) is float, "prefix/items scalar members survive nested union flattening")
            c.equal(value.to_dict(), data, "nested union arrays encode concrete model/scalar values")

    cases = (operation_layout, named_boundaries, inline_properties, inline_body, property_parameter_names,
             reference_chains, allof_merging, prefix_items, additional_properties, argument_docstrings,
             return_docstrings, nullable_enums, literal_enums, union_annotations, union_matching,
             union_encoding, combined_unions_arrays)
    for test_id, case in zip(SUITES["schema-models"], cases):
        c.case(test_id, case)


RUNNERS = {"schema-models": schema_model_checks}
