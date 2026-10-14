"""Create a disposable, two-commit pytest review demo: python create.py /tmp/demo."""
import pathlib
import subprocess
import sys

repo = pathlib.Path(sys.argv[1]).resolve()
repo.mkdir(parents=True, exist_ok=False)

def git(*args):
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()

git("init", "-q")
git("config", "user.name", "Coverage demo")
git("config", "user.email", "demo@example.invalid")
(repo / "pyproject.toml").write_text('''[project]
name = "coverage-demo"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["pytest>=8", "pytest-cov>=6"]
''')
(repo / "pricing.py").write_text('''def price(quantity):
    return quantity * 10


def refund(amount):
    return amount
''')
(repo / "test_pricing.py").write_text('''from pricing import price


def test_regular():
    assert price(1) == 10
''')
git("add", ".")
git("commit", "-qm", "Base pricing")
base = git("rev-parse", "HEAD")
(repo / "pricing.py").write_text('''def price(quantity):
    if quantity >= 10:
        return quantity * 8
    return quantity * 10


def refund(amount):
    return max(0, amount - 2)
''')
(repo / "test_pricing.py").write_text('''import pytest
from pricing import price


def test_regular():
    assert price(2) == 20


@pytest.mark.parametrize("quantity,expected", [(10, 80), (20, 160)])
def test_bulk(quantity, expected):
    assert price(quantity) == expected
''')
git("add", ".")
git("commit", "-qm", "Bulk pricing and changed tests")
print(f"bun run review --repo {repo} --base {base} --head HEAD --port 3000")
