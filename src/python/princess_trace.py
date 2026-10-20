"""Pytest call-phase profiler. Serialized data contains code/flow metadata only."""
import ast
import dis
import json
import os
import pathlib
import sys
import threading
import tokenize

import pytest

MAX_CALLS = 2000
MAX_TOTAL = 10000
ROOT = pathlib.Path(os.environ.get("PRINCESS_TRACE_ROOT", ".")).resolve()
FILES = json.loads(pathlib.Path(os.environ["PRINCESS_TRACE_MANIFEST"]).read_text()) if os.environ.get("PRINCESS_TRACE_MANIFEST") else []
FUNCTIONS = {}
TRACES = []
TOTAL = 0
ACTIVE = None


class Recorder:
    def __init__(self, nodeid, root=ROOT, files=FILES):
        self.trace = {"nodeid": nodeid, "outcome": "unknown", "calls": [], "truncated": False}
        self.root = pathlib.Path(root).resolve()
        self.allowed = {os.path.normcase(os.path.realpath(self.root / path)): path for path in files}
        self.frames = {}
        self.suspended = {}
        self.codes = {}
        self.yield_offsets = {}
        self.documents = {}
        self.threads = {}
        self.lock = threading.RLock()
        self.active = True
        self.sequence = 0

    def function(self, code):
        if code in self.codes:
            return self.codes[code]
        path = self.allowed.get(os.path.normcase(os.path.realpath(code.co_filename)))
        if path is None or code.co_name == "<module>":
            self.codes[code] = None
            return None
        if path not in self.documents:
            with tokenize.open(self.root / path) as source:
                text = source.read()
            tree = ast.parse(text)
            self.documents[path] = (text.splitlines(), list(ast.walk(tree)))
        lines, nodes = self.documents[path]
        candidates = [node for node in nodes if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp))
                      and min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])]) == code.co_firstlineno]
        special = {"<lambda>": ast.Lambda, "<listcomp>": ast.ListComp, "<setcomp>": ast.SetComp, "<dictcomp>": ast.DictComp, "<genexpr>": ast.GeneratorExp}
        candidates = [node for node in candidates if (getattr(node, "name", None) == code.co_name or isinstance(node, special.get(code.co_name, type(None))))]
        # Class-body frames are not function invocations.
        if not candidates and not code.co_name.startswith("<"):
            self.codes[code] = None
            return None
        node = min(candidates, key=lambda n: n.end_lineno - n.lineno) if candidates else None
        start = code.co_firstlineno
        end = node.end_lineno if node else start
        name = getattr(code, "co_qualname", code.co_name)
        function_id = f"{path}:{start}:{name}"
        FUNCTIONS[function_id] = {"id": function_id, "name": name, "path": path, "line": start,
                                  "endLine": end, "source": "\n".join(lines[start - 1:end])}
        # Python 3.13 profiles a suspension at RESUME, earlier versions at YIELD.
        offsets = set()
        previous_yield = False
        for instruction in dis.get_instructions(code):
            is_yield = instruction.opname in ("YIELD_VALUE", "YIELD_FROM")
            if is_yield or (previous_yield and instruction.opname == "RESUME"):
                offsets.add(instruction.offset)
            previous_yield = is_yield
        self.yield_offsets[code] = offsets
        self.codes[code] = function_id
        return function_id

    def profile(self, frame, event, arg):
        with self.lock:
            self._profile(frame, event)

    def _profile(self, frame, event):
        global TOTAL
        if not self.active or event not in ("call", "return"):
            return
        identity = id(frame)
        if event == "return":
            call = self.frames.pop(identity, None)
            if call is None:
                return
            self.sequence += 1
            call["exitOrder"] = self.sequence
            if frame.f_lasti in self.yield_offsets[frame.f_code]:
                call["suspended"] = True
                self.suspended[identity] = (frame, call["id"])
            return
        function_id = self.function(frame.f_code)
        if function_id is None:
            return
        if len(self.trace["calls"]) >= MAX_CALLS or TOTAL >= MAX_TOTAL:
            self.trace["truncated"] = True
            return
        ancestor = frame.f_back
        while ancestor is not None and id(ancestor) not in self.frames:
            ancestor = ancestor.f_back
        parent = self.frames.get(id(ancestor)) if ancestor is not None else None
        self.sequence += 1
        TOTAL += 1
        previous = self.suspended.pop(identity, None)
        thread = threading.get_ident()
        if thread not in self.threads:
            self.threads[thread] = len(self.threads) + 1
        call = {"id": len(self.trace["calls"]) + 1, "functionId": function_id,
                "parentId": parent["id"] if parent else None, "callLine": ancestor.f_lineno if ancestor else None,
                "thread": self.threads[thread], "entryOrder": self.sequence,
                "kind": "resume" if previous else "call", "resumeFrom": previous[1] if previous else None}
        self.frames[identity] = call
        self.trace["calls"].append(call)

    def stop(self):
        with self.lock:
            self.active = False
            self.frames.clear()
            self.suspended.clear()


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_runtest_call(item):
    global ACTIVE
    recorder = Recorder(item.nodeid)
    TRACES.append(recorder.trace)
    ACTIVE = recorder
    previous = sys.getprofile()
    previous_thread = getattr(threading, "getprofile", lambda: None)()
    sys.setprofile(recorder.profile)
    threading.setprofile(recorder.profile)
    try:
        yield
    finally:
        sys.setprofile(previous)
        threading.setprofile(previous_thread)
        recorder.stop()
        ACTIVE = None


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    result = yield
    report = result.get_result()
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        trace = next((trace for trace in reversed(TRACES) if trace["nodeid"] == item.nodeid), None)
        if trace is None:
            trace = {"nodeid": item.nodeid, "calls": [], "truncated": False}
            TRACES.append(trace)
        trace["outcome"] = report.outcome


def pytest_sessionfinish(session, exitstatus):
    output = os.environ.get("PRINCESS_TRACE_OUTPUT")
    if output:
        pathlib.Path(output).write_text(json.dumps({"functions": list(FUNCTIONS.values()), "tests": TRACES}), encoding="utf-8")
