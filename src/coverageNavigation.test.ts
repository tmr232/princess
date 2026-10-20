import { expect, test } from "bun:test";
import { coverageNavigation } from "./coverageNavigation";
import type { Review, Change } from "./model";
import type { CoverageState } from "./coverage";

const change = (name: string, status: Change["status"] = "modified"): Change => ({
  id: `function:${name}`, name, kind: "function", parent: null, status,
  before: null, after: status === "removed" ? null : { id: name, name, kind: "function", parent: null, start: 0, end: 10, line: 1, signature: `def ${name}():` },
});
const review: Review = { repo: "/demo", base: "base", head: "head", files: [
  { id: "0", path: "service.py", oldPath: "service.py", status: "M", supported: true, changes: [change("price"), change("refund", "added"), change("removed", "removed")] },
  { id: "1", path: "test_service.py", oldPath: "test_service.py", status: "M", supported: true, changes: [change("test_price"), change("test_empty", "added")] },
] };
const targets = ["test_price", "test_empty"].map(name => ({ nodeid: `test_service.py::${name}`, fileId: "1", changeId: `function:${name}` }));
const state: CoverageState = { status: "complete", targets, selected: targets.map(t => t.nodeid), command: "", output: "", functions: [
  { fileId: "0", changeId: "function:price", name: "price", path: "service.py", tests: ["test_service.py::test_price[one]", "test_service.py::test_price[two]", "unrelated_test"], executable: [2], covered: [2], contexts: {} },
  { fileId: "1", changeId: "function:test_empty", name: "test_empty", path: "test_service.py", tests: ["test_service.py::test_empty"], executable: [2], covered: [2], contexts: {} },
], report: { files: { "test_service.py": { executed_lines: [2], missing_lines: [], contexts: { "2": ["test_service.py::test_price[one]|run", "test_service.py::test_price[two]|run", "test_service.py::test_empty|run", "test_service.py::test_price_other|run"] } } } } };

test("coverage navigation maps changed tests and functions in both directions with parametrized cases", () => {
  const nav = coverageNavigation(review, state);
  expect(nav.functions.map(fn => fn.name)).toEqual(["price", "refund"]);
  expect(nav.tests.map(test => test.nodeid)).toEqual(["test_service.py::test_price[one]", "test_service.py::test_price[two]", "test_service.py::test_empty"]);
  expect(nav.tests[2]!.functions).toEqual([]);
  expect(nav.functions[1]!.tests).toEqual([]);
  for (const fn of nav.functions) for (const testId of fn.tests) {
    expect(nav.tests.find(test => test.nodeid === testId)!.functions).toContain(fn);
  }
  expect(nav.functions[0]!.tests).not.toContain("unrelated_test");
});

test("unrun changed tests and unreached functions remain navigable without stale relationships", () => {
  const nav = coverageNavigation(review, { ...state, status: "running" });
  expect(nav.tests.map(test => test.nodeid)).toEqual(targets.map(target => target.nodeid));
  expect(nav.functions.every(fn => fn.tests.length === 0)).toBe(true);
  expect(nav.tests.every(test => test.functions.length === 0)).toBe(true);
  expect(coverageNavigation(review, null).functions.map(fn => fn.name)).toEqual(["price", "refund"]);
  expect(coverageNavigation(review, null).tests.map(test => test.nodeid)).toEqual(targets.map(target => target.nodeid));
});
