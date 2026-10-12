"""Controller-supplied process/import observations for offline setup checks.

This is diagnostic instrumentation, not an isolation mechanism. Docker independently
blocks network access. Trace entries are written outside the candidate source copy.
"""
import json
import os
import sys

_destination = os.environ.get("PUBLIC_CHECK_TRACE_PATH")
_dumps = json.dumps
_busy = False


def record(event, **values):
    global _busy
    if not _destination or _busy:
        return
    _busy = True
    try:
        with open(_destination, "a", encoding="utf-8") as stream:
            stream.write(_dumps({"event": event, "pid": os.getpid(), **values}, default=str) + "\n")
    finally:
        _busy = False


if _destination:
    try:
        with open("/proc/self/cmdline", "rb") as stream:
            command = [value.decode("utf-8", "replace") for value in stream.read().split(b"\0") if value]
    except OSError:
        command = list(sys.argv)
    record("python_process", argv=command, executable=sys.executable, prefix=sys.prefix,
           pip_no_index=os.environ.get("PIP_NO_INDEX"), cwd=os.getcwd())

    def audited(event, arguments):
        if event == "import" and arguments[0] in ("httpx", "ruamel.yaml", "yaml"):
            record("import", module=arguments[0])
        elif event == "socket.connect":
            record("socket_connect", address=arguments[1])
        elif event == "subprocess.Popen":
            record("subprocess", argv=arguments[1])

    sys.addaudithook(audited)
    for _name in ("load", "loads"):
        _original = getattr(json, _name)

        def observed(*args, _original=_original, _name=_name, **kwargs):
            record("parser", parser="json." + _name, caller=sys._getframe(1).f_code.co_filename)
            return _original(*args, **kwargs)

        setattr(json, _name, observed)
