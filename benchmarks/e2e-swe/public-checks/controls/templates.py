"""Authored finite positive-control outputs, not a production OpenAPI generator.

These templates exercise the public checker with two fixed public input fixtures.
They are intentionally independent of run_public_checks.py and are never offered
as a completed benchmark solution. No hidden test or past candidate was consulted.
"""
from textwrap import dedent


RUNTIME = {
    "__init__.py": "",
    "types.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from typing import Generic, TypeVar

        class Unset:
            def __bool__(self):
                return False

        UNSET = Unset()

        @dataclass
        class File:
            payload: object
            file_name: str | None
            mime_type: str | None

            def to_tuple(self):
                return (self.file_name, self.payload, self.mime_type)

        T = TypeVar("T")

        @dataclass
        class Response(Generic[T]):
            status_code: object
            content: bytes
            headers: dict
            parsed: T
    ''',
    "client.py": '''
        from dataclasses import dataclass

        @dataclass
        class Client:
            base_url: str
            raise_on_unexpected_status: bool = False

        @dataclass
        class AuthenticatedClient:
            base_url: str
            token: str
            raise_on_unexpected_status: bool = False
            prefix: str = "Bearer"
            auth_header_name: str = "Authorization"
    ''',
    "errors.py": "class UnexpectedStatus(Exception):\n    pass\n",
    "api/__init__.py": "",
    "models/__init__.py": "",
    "models/_support.py": '''
        from __future__ import annotations
        from collections.abc import Mapping
        from dataclasses import MISSING, fields
        from datetime import date, datetime
        from enum import Enum
        from uuid import UUID
        from ..types import UNSET, Unset

        def encode(value):
            if isinstance(value, Model):
                return value.to_dict()
            if isinstance(value, Enum):
                return value.value
            if isinstance(value, (date, datetime)):
                return value.isoformat()
            if isinstance(value, UUID):
                return str(value)
            if isinstance(value, list):
                return [encode(item) for item in value]
            if isinstance(value, dict):
                return {key: encode(item) for key, item in value.items()}
            return value

        class Model:
            _json_names = {}
            _decoders = {}

            def __post_init__(self):
                self.additional_properties = {}

            @classmethod
            def from_dict(cls, data):
                if not isinstance(data, Mapping):
                    raise TypeError("expected a Mapping")
                arguments = {}
                known = set()
                for field in fields(cls):
                    key = cls._json_names.get(field.name, field.name)
                    known.add(key)
                    if key not in data:
                        if field.default is MISSING and field.default_factory is MISSING:
                            raise KeyError(key)
                        continue
                    arguments[field.name] = cls._decoders.get(field.name, lambda value: value)(data[key])
                result = cls(**arguments)
                result.additional_properties = {key: value for key, value in data.items() if key not in known}
                return result

            def to_dict(self):
                result = dict(self.additional_properties)
                for field in fields(self):
                    value = getattr(self, field.name)
                    if isinstance(value, Unset):
                        continue
                    key = self._json_names.get(field.name, field.name)
                    result[key] = encode(value)
                return result

            def __getitem__(self, key):
                return self.additional_properties[key]

            def __setitem__(self, key, value):
                self.additional_properties[key] = value

            def __contains__(self, key):
                return key in self.additional_properties

            @property
            def additional_keys(self):
                return list(self.additional_properties)
    ''',
}

CORE = {
    "models/probe.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from ..types import UNSET, Unset
        from ._support import Model

        @dataclass
        class Probe(Model):
            """A public model fixture.

            Attributes:
                title (str): A required title.
                note (str | Unset):
                string_prop (str | Unset): A JSON name.
            """
            title: str
            note: str | Unset = UNSET
            string_prop: str | Unset = UNSET
            _json_names = {"string_prop": "stringProp"}
    ''',
    "models/scalar_probe.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from typing import Any
        from ._support import Model

        @dataclass
        class ScalarProbe(Model):
            enabled: bool
            text: str
            count: int
            amount: float
            nothing: None
            anything: Any
    ''',
    "models/format_probe.py": '''
        from __future__ import annotations
        import datetime
        from dataclasses import dataclass
        from uuid import UUID
        from ._support import Model

        @dataclass
        class FormatProbe(Model):
            day: datetime.date
            moment: datetime.datetime
            identifier: UUID
            unknown: str
            _decoders = {"day": datetime.date.fromisoformat, "moment": datetime.datetime.fromisoformat, "identifier": UUID}
    ''',
    "models/child.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from ._support import Model

        @dataclass
        class Child(Model):
            child_name: str
            _json_names = {"child_name": "childName"}
    ''',
    "models/collections_probe.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from typing import Any
        from ._support import Model
        from .child import Child

        @dataclass
        class CollectionsProbe(Model):
            child: Child
            records: list[Child]
            values: list[Any]
            _decoders = {"child": Child.from_dict, "records": lambda data: [Child.from_dict(item) for item in data]}
    ''',
    "models/status.py": '''
        from enum import Enum

        class Status(str, Enum):
            READY = "ready"
            WAITING = "waiting"
    ''',
    "models/__init__.py": '''
        from .probe import Probe
        from .scalar_probe import ScalarProbe
        from .format_probe import FormatProbe
        from .child import Child
        from .collections_probe import CollectionsProbe
        from .status import Status
    ''',
}

DEFAULTS = {
    "models/color.py": '''
        from enum import Enum

        class Color(str, Enum):
            A = "a"
            B = "B"
            A23 = "a23"
            VALUE_3 = "123"
            SPARE = "spare"
            VALUE_5 = "!"
            VALUE_6 = ""
            A_THING_WITH_SPACES = "a Thing WIth spaces"
    ''',
    "models/number.py": '''
        from enum import Enum

        class Number(int, Enum):
            VALUE_2 = 2
            VALUE_NEGATIVE_4 = -4
    ''',
    "models/custom_number.py": '''
        from enum import Enum

        class CustomNumber(int, Enum):
            ONE = 1
            MORE_THAN_ON_E = 2
            NOT_QUITE_FOUR = 3
            NEGATIVE_FOUR = 4
    ''',
    "models/enum_probe.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from ._support import Model
        from .color import Color
        from .number import Number

        def constant(value):
            if value != "fixed":
                raise ValueError("constant mismatch")
            return value

        @dataclass
        class EnumProbe(Model):
            color: Color
            number: Number
            marker: str
            _decoders = {"color": Color, "number": Number, "marker": constant}
    ''',
    "models/defaults.py": '''
        from __future__ import annotations
        import datetime
        from dataclasses import dataclass
        from uuid import UUID
        from ..types import UNSET, Unset
        from ._support import Model
        from .color import Color

        @dataclass
        class Defaults(Model):
            day: datetime.date | Unset = datetime.date(2020, 1, 2)
            moment: datetime.datetime | Unset = datetime.datetime(2020, 1, 2, 3, 4, 5)
            identifier: UUID | Unset = UUID("12345678-1234-5678-1234-567812345678")
            count: int | Unset = 4
            amount: float | Unset = 5.5
            upper_true: bool | Unset = True
            lower_true: bool | Unset = True
            upper_false: bool | Unset = False
            lower_false: bool | Unset = False
            color: Color | Unset = Color.A
            absent: str | Unset = UNSET
            _json_names = {"upper_true": "upperTrue", "lower_true": "lowerTrue", "upper_false": "upperFalse", "lower_false": "lowerFalse"}
    ''',
    "models/__init__.py": '''
        from .color import Color
        from .number import Number
        from .custom_number import CustomNumber
        from .enum_probe import EnumProbe
        from .defaults import Defaults
    ''',
}

SURVIVOR = {
    "models/survivor.py": '''
        from __future__ import annotations
        from dataclasses import dataclass
        from ._support import Model

        @dataclass
        class Survivor(Model):
            title: str
    ''',
    "models/__init__.py": "from .survivor import Survivor\n",
}


def source_files(variant):
    content = {**RUNTIME, **{"core": CORE, "defaults": DEFAULTS, "survivor": SURVIVOR, "empty": {}}[variant]}
    return {name: dedent(text).lstrip("\n") for name, text in content.items()}
