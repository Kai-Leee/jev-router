"""Parse supplied source as data; never import or execute candidate code."""
import ast
import json
import posixpath
import sys


def literal(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def call_name(node):
    return node.id if isinstance(node, ast.Name) else None


def loader_root(node, path, names):
    if not isinstance(node, ast.Call):
        return None
    name = call_name(node.func)
    if names.get(name) == "PackageLoader" and len(node.args) >= 2:
        package, directory = literal(node.args[0]), literal(node.args[1])
        if package and directory and all(part.isidentifier() for part in package.split(".")):
            return package.replace(".", "/") + "/" + directory
    if names.get(name) == "FileSystemLoader" and node.args:
        arg = node.args[0]
        if isinstance(arg, ast.Call) and call_name(arg.func) == "str" and len(arg.args) == 1:
            arg = arg.args[0]
        if isinstance(arg, ast.Call) and isinstance(arg.func, ast.Attribute) and arg.func.attr == "with_name" and len(arg.args) == 1:
            base, directory = arg.func.value, literal(arg.args[0])
            if names.get("Path") == "pathlib.Path" and names.get("str", "builtin.str") == "builtin.str" and names.get("__file__", "runtime.__file__") == "runtime.__file__" and isinstance(base, ast.Call) and call_name(base.func) == "Path" and len(base.args) == 1 and isinstance(base.args[0], ast.Name) and base.args[0].id == "__file__" and directory:
                return posixpath.dirname(path) + "/" + directory
    return None


def inspect_source(path, source):
    try:
        tree = ast.parse(source, filename=path)
    except (SyntaxError, ValueError, RecursionError) as error:
        return {"error": type(error).__name__, "line": getattr(error, "lineno", None)}
    scopes = {0: {"parent": None, "bindings": {}}}
    nodes = []
    counter = 0

    def visit(node, scope):
        nonlocal counter
        nodes.append((node, scope))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            if hasattr(node, "name"):
                scopes[scope]["bindings"].setdefault(node.name, []).append(None)
            counter += 1
            child = counter
            scopes[child] = {"parent": scope, "bindings": {}}
            # Parameters shadow parent bindings and cannot be assumed to be an Environment.
            for arg in getattr(getattr(node, "args", None), "args", []):
                scopes[child]["bindings"].setdefault(arg.arg, []).append(None)
            scope = child
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    scopes[scope]["bindings"].setdefault(target.id, []).append(getattr(node, "value", None))
                elif isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
                    # Mutating an environment/loader attribute invalidates its constructor-only proof.
                    scopes[scope]["bindings"].setdefault(target.value.id, []).append(None)
        for child in ast.iter_child_nodes(node):
            visit(child, scope)

    visit(tree, 0)
    imports, dynamic_imports, templates, definitions = [], [], [], []
    jinja_names = {}
    importers = {"__import__"}
    for node, _ in nodes:
        if isinstance(node, ast.ImportFrom) and node.module == "jinja2" and node.level == 0:
            for name in node.names:
                jinja_names[name.asname or name.name] = name.name
        if isinstance(node, ast.ImportFrom) and node.module == "pathlib" and node.level == 0:
            for name in node.names:
                if name.name == "Path":
                    jinja_names[name.asname or name.name] = "pathlib.Path"
        if isinstance(node, ast.ImportFrom) and node.module == "importlib" and node.level == 0:
            for name in node.names:
                if name.name == "import_module":
                    importers.add(name.asname or name.name)
    while True:
        previous = len(importers)
        for scope in scopes.values():
            for name, values in scope["bindings"].items():
                if any(isinstance(value, ast.Name) and value.id in importers for value in values):
                    importers.add(name)
        if len(importers) == previous:
            break
    # Rebinding a Jinja constructor makes its loader proof unavailable.
    for scope in scopes.values():
        for name in scope["bindings"]:
            if name in {"str", "__file__"}:
                jinja_names[name] = "shadowed"
            else:
                jinja_names.pop(name, None)

    def binding(name, scope):
        while scope is not None:
            values = scopes[scope]["bindings"].get(name)
            if values is not None:
                return values[0] if len(values) == 1 else None
            scope = scopes[scope]["parent"]
        return None

    for node, scope in nodes:
        if isinstance(node, ast.Import):
            imports.extend({"module": name.name, "members": [], "level": 0, "package_subtree": True, "line": node.lineno} for name in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append({"module": node.module or "", "members": [name.name for name in node.names], "level": node.level, "package_subtree": False, "line": node.lineno})
        elif isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            definitions.append({"name": node.name, "kind": "class" if isinstance(node, ast.ClassDef) else "function"})
        elif isinstance(node, ast.Call):
            function = node.func
            if call_name(function) in importers or isinstance(function, ast.Attribute) and function.attr in {"import_module", "__import__"}:
                dynamic_imports.append({"module": literal(node.args[0]) if node.args else None, "line": node.lineno})
            if call_name(function) == "getattr" and len(node.args) > 1 and literal(node.args[1]) in {"__import__", "import_module"}:
                dynamic_imports.append({"module": None, "line": node.lineno})
            if isinstance(function, ast.Attribute) and function.attr == "get_template":
                target = literal(node.args[0]) if node.args else None
                root = None
                if isinstance(function.value, ast.Name):
                    environment = binding(function.value.id, scope)
                    if isinstance(environment, ast.Call) and jinja_names.get(call_name(environment.func)) == "Environment":
                        loaders = [item.value for item in environment.keywords if item.arg == "loader"]
                        if len(loaders) == 1:
                            root = loader_root(loaders[0], path, jinja_names)
                templates.append({"literal": target, "loader_root": root, "line": node.lineno})
    return {"imports": imports, "dynamic_imports": dynamic_imports, "templates": templates, "definitions": definitions}


payload = json.load(sys.stdin)
result = {item["path"]: inspect_source(item["path"], item["content"]) for item in payload["files"] if item["path"].endswith(".py")}
json.dump(result, sys.stdout, ensure_ascii=False, separators=(",", ":"))
