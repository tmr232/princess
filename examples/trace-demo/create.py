"""Create a two-commit pytest trace demo: python create.py /tmp/trace-demo."""
import pathlib
import subprocess
import sys
repo = pathlib.Path(sys.argv[1]).resolve()
repo.mkdir(parents=True, exist_ok=False)
def git(*args):
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()
git("init", "-q")
git("config", "user.name", "Trace demo")
git("config", "user.email", "demo@example.invalid")
(repo / "pyproject.toml").write_text('''[project]
name = "trace-demo"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["pytest>=8"]
''')
base = '''def unit_price(product):
    if product == "book":
        return 12
    return 5


def line_total(product, quantity):
    return unit_price(product) * quantity


def order_total(items):
    total = 0
    for product, quantity in items:
        total += line_total(product, quantity)
    return total
'''
(repo / "orders.py").write_text(base)
(repo / "test_orders.py").write_text('''from orders import order_total


def test_order():
    assert order_total([("book", 1)]) == 12
''')
git("add", ".")
git("commit", "-qm", "Base orders")
head = base.replace('    return unit_price(product) * quantity', '    return discount(unit_price(product) * quantity, quantity)') + '''

def discount(total, quantity):
    if quantity >= 10:
        return total * 0.8
    return total
'''
(repo / "orders.py").write_text(head)
(repo / "test_orders.py").write_text('''import pytest
from orders import order_total


def test_order():
    assert order_total([("book", 2), ("pen", 3)]) == 39


@pytest.mark.parametrize("quantity,expected", [(10, 96), (20, 192)])
def test_bulk(quantity, expected):
    assert order_total([("book", quantity)]) == expected


def test_failure():
    assert order_total([("book", 1)]) == -1
''')
git("add", ".")
git("commit", "-qm", "Trace discount flow with repeated calls")
print(f"bun run review --repo {repo} --base HEAD~ --head HEAD --port 3002")
