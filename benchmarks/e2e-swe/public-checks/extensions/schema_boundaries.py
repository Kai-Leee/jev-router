"""D095 public-spec boundary predicates. No hidden test import or fixture.

Cases retain v4 identities; v5 strengthens the predicates and declares their
producer/consumer candidates in assertions.v3.json. No exact inline response
class name is prescribed by this check.
"""
import importlib
import json


def response_imports(h):
    spec = {"openapi": "3.1.0", "info": {"title": "Public response boundary", "version": "1"},
            "paths": {}, "components": {"schemas": {}}}
    for name, schema in (("read_text", {"type": "string"}),
                         ("read_record", {"type": "object", "required": ["label"], "properties": {"label": {"type": "string"}}}),
                         ("read_numbers", {"type": "array", "items": {"type": "integer"}})):
        spec["paths"]["/" + name] = {"get": {"operationId": name,
            "responses": {"200": {"description": "Public response", "content": {"application/json": {"schema": schema}}}}}}
    pkg, _ = h.generate_spec(spec, "public_response_boundary")
    modules = [importlib.import_module(pkg.__name__ + ".api.default." + name)
               for name in ("read_text", "read_record", "read_numbers")]
    return all(callable(getattr(module, f, None)) for module in modules
               for f in ("sync", "sync_detailed", "asyncio", "asyncio_detailed"))


def prefix_roundtrip(h):
    wire = {"7value": "digit", "_secret": "underscore"}
    spec = {"openapi": "3.1.0", "info": {"title": "Public prefix boundary", "version": "1"}, "paths": {},
            "components": {"schemas": {"BoundaryRecord": {"type": "object", "required": list(wire),
                "properties": {key: {"type": "string"} for key in wire}}}}}
    for index, prefix in enumerate(("field_", "custom_", "attr_")):
        pkg, _ = h.generate_spec(spec, "public_prefix_boundary_" + str(index),
                                 config={"post_hooks": [], "field_prefix": prefix})
        model = importlib.import_module(pkg.__name__ + ".models").BoundaryRecord
        # Public snake_case strips leading separators; the prefix restores a
        # legal exposed attribute. Digits must not gain an extra separator.
        kwargs = {prefix + "7value": "digit", prefix + "secret": "underscore"}
        value = model(**kwargs)
        if value.to_dict() != wire or model.from_dict(wire) != value:
            return False
    return True


EXTRA = {"T.R04.05": ("A.R04.05.response-imports", response_imports),
         "T.R18.02": ("A.R18.02.prefix-roundtrip", prefix_roundtrip)}


def strengthen(base):
    original_checks = base.Checks

    class BoundaryChecks(original_checks):
        def case(self, test_id, function):
            def augmented():
                function()
                if test_id in EXTRA:
                    assertion, check = EXTRA[test_id]
                    try:
                        passed, message = check(self.harness), "Public schema boundary violated"
                    except Exception as exc:
                        passed, message = False, f"{type(exc).__name__}: {exc}"
                    self.require(passed, message, assertion_id=assertion)
            super().case(test_id, augmented)

    base.Checks = BoundaryChecks
    for suite, runner in list(base.RUNNERS.items()):
        def wrapped(h, c, runner=runner):
            c.harness = h
            return runner(h, c)
        base.RUNNERS[suite] = wrapped
