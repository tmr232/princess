import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReview, analyze } from "./review";
import { testTargets, mapCoverage, CoverageRunner } from "./coverage";

test("changed test selectors and context attribution exclude imports, setup and nested bodies", async () => {
  const repo = await mkdtemp(join(tmpdir(), "coverage-unit-"));
  const git = (...args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], { cwd: repo });
    if (p.exitCode) throw new Error(p.stderr.toString());
    return p.stdout.toString().trim();
  };
  try {
    git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid");
    await writeFile(join(repo, "base"), "base"); git("add", "."); git("commit", "-qm", "base");
    const source = "def outer():\n    def inner():\n        return 2\n    return inner()\n\ndef untouched():\n    return 3\n\ndef inline(): return 4\n";
    await writeFile(join(repo, "service.py"), source);
    await writeFile(join(repo, "test_service.py"), "def test_plain():\n    pass\n\nclass TestService:\n    def test_method(self):\n        pass\n\ndef helper():\n    def test_nested():\n        pass\n");
    await writeFile(join(repo, "production.py"), "def test_not_pytest():\n    pass\n");
    git("add", "."); git("commit", "-qm", "head");
    const { review, sources } = await createReview(repo, "HEAD~", "HEAD");
    expect(testTargets(review).map(t => t.nodeid)).toEqual(["test_service.py::test_plain", "test_service.py::TestService::test_method"]);
    const file = review.files.find(f => f.path === "service.py")!;
    const mapped = mapCoverage(review, sources, { files: { "service.py": {
      executed_lines: [1, 2, 3, 4, 6, 7, 9], missing_lines: [], contexts: {
        "1": [""], "2": ["test_service.py::test_plain|run"],
        "3": ["test_service.py::test_method[param]|run"],
        "4": ["test_service.py::test_plain|run"],
        "7": ["test_service.py::test_plain|setup"],
        "9": ["test_service.py::test_plain|run"],
      }
    } } }, new Map([[file.id, await analyze(source)]]));
    expect(mapped.find(f => f.name === "outer")!.tests).toEqual(["test_service.py::test_plain"]);
    expect(mapped.find(f => f.name === "outer.inner")!.tests).toEqual(["test_service.py::test_method[param]"]);
    expect(mapped.find(f => f.name === "untouched")!.tests).toEqual([]);
    expect(mapped.find(f => f.name === "inline")!.tests).toEqual(["test_service.py::test_plain"]);
    expect(mapped.find(f => f.name === "outer.inner")!.contexts["3"]).toEqual(["test_service.py::test_method[param]"]);
    const runner = new CoverageRunner(review, sources);
    expect(() => runner.start([])).toThrow("Select changed pytest tests");
    expect(() => runner.start(["--help"])).toThrow("Select changed pytest tests");
    runner.state.status = "running";
    expect(() => runner.start([testTargets(review)[0]!.nodeid])).toThrow("already running");
  } finally { await rm(repo, { recursive: true, force: true }); }
});
