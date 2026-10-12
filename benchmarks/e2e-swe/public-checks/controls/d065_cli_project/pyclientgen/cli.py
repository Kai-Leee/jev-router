from pathlib import Path
import runpy
import sys


def run_cli():
    controls = Path(__file__).resolve().parents[1] / "controls"
    sys.path.insert(0, str(controls))
    runpy.run_path(str(controls / "generator.py"), run_name="__main__")


class Command:
    """A valid callable console app, without requiring a plain function entrypoint."""
    def __call__(self):
        return run_cli()


main = Command()
