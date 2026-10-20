import { expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { traceReportSchema, TraceRunner, type TraceFunction, type TraceCall } from "./trace";
import { traceLayout } from "./traceLayout";

// Exercise the Python profiler without requiring pytest or network in the test environment.
test("profiler preserves repeated calls, recursion and generator resumes without runtime values or external calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "trace-test-"));
  try {
    // Imported code can use an alias (/var vs /private/var on macOS, for example).
    const alias = join(root, "alias");
    const source = join(root, "source");
    await mkdir(source);
    await symlink(source, alias, process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(source, "flow.py"), `def echo(value):\n    return value\n\ndef recurse(depth):\n    if depth:\n        return recurse(depth - 1)\n    return 0\n\ndef stream():\n    yield 1\n    yield 2\n\ndef flow(value):\n    echo(value)\n    echo(value)\n    recurse(2)\n    list(stream())\n    return value\n`);
    await appendFile(join(source, "flow.py"), "\ndef thread_flow(value):\n    from threading import Thread\n    worker = Thread(target=echo, args=(value,))\n    worker.start()\n    worker.join()\n");
    const plugin = join(import.meta.dir, "python/princess_trace.py");
    const script = `import sys, types, importlib.util, json
sys.modules['pytest'] = types.SimpleNamespace(hookimpl=lambda **kwargs: lambda fn: fn)
spec = importlib.util.spec_from_file_location('tracer', ${JSON.stringify(plugin)})
tracer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tracer)
sys.path.insert(0, ${JSON.stringify(alias)})
import flow
recorder = tracer.Recorder('test_flow[param]', ${JSON.stringify(source)}, ['flow.py'])
sys.setprofile(recorder.profile)
flow.flow('runtime-token-that-must-never-be-exported')
sys.setprofile(None)
recorder.stop()
recorder.trace['outcome'] = 'passed'
tracer.TOTAL = 0
tracer.MAX_CALLS = 3
limited = tracer.Recorder('test_limit', ${JSON.stringify(source)}, ['flow.py'])
sys.setprofile(limited.profile)
flow.flow('another-runtime-token')
sys.setprofile(None)
limited.stop()
limited.trace['outcome'] = 'passed'
tracer.TOTAL = 0
tracer.MAX_CALLS = 2000
worker = tracer.Recorder('test_thread', ${JSON.stringify(source)}, ['flow.py'])
import threading
threading.setprofile(worker.profile)
sys.setprofile(worker.profile)
flow.thread_flow('worker-runtime-token')
sys.setprofile(None)
threading.setprofile(None)
worker.stop()
worker.trace['outcome'] = 'passed'
print(json.dumps({'functions': list(tracer.FUNCTIONS.values()), 'tests': [recorder.trace, limited.trace, worker.trace]}))
`;
    const child = Bun.spawn(["python", "-c", script], { stdout: "pipe", stderr: "pipe" });
    const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(0); expect(errors).toBe("");
    expect(output).not.toContain("runtime-token-that-must-never-be-exported");
    expect(output).not.toContain("worker-runtime-token");
    expect(output).not.toContain("another-runtime-token");
    const report = traceReportSchema.parse(JSON.parse(output));
    const names = new Map(report.functions.map(fn => [fn.id, fn.name]));
    const calls = report.tests[0]!.calls;
    expect(calls.filter(call => names.get(call.functionId) === "echo")).toHaveLength(2);
    expect(calls.filter(call => names.get(call.functionId) === "recurse")).toHaveLength(3);
    expect(calls.filter(call => call.kind === "resume")).toHaveLength(2);
    expect(calls.filter(call => call.resumeFrom !== null)).toHaveLength(2);
    expect(calls.filter(call => names.get(call.functionId) === "stream").map(call => [call.kind, call.suspended ?? false])).toEqual([
      ["call", true], ["resume", true], ["resume", false],
    ]);
    expect(report.tests[1]!.truncated).toBe(true);
    expect(report.tests[1]!.calls).toHaveLength(3);
    expect(report.tests[2]!.calls.some(call => call.thread === 2 && call.parentId === null)).toBe(true);
    expect(calls[0]!.parentId).toBeNull();
    for (const call of calls) if (call.parentId !== null) expect(call.parentId).toBeLessThan(call.id);
    expect(report.functions.every(fn => fn.path === "flow.py")).toBe(true);
    expect(Object.keys(calls[0]!)).not.toContain("locals");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("canvas gives each invocation its own block, with parent and resume connections", () => {
  const functions: TraceFunction[] = [{ id: "f", name: "f", path: "code.py", line: 1, endLine: 2, source: "def f():\n    pass" }];
  const calls: TraceCall[] = [
    { id: 1, functionId: "f", parentId: null, callLine: null, thread: 1, entryOrder: 1, kind: "call", resumeFrom: null },
    { id: 2, functionId: "f", parentId: 1, callLine: 2, thread: 1, entryOrder: 2, kind: "call", resumeFrom: null },
    { id: 3, functionId: "f", parentId: 1, callLine: 2, thread: 1, entryOrder: 4, kind: "resume", resumeFrom: 2 },
  ];
  const scene = traceLayout(calls, functions);
  expect(scene.blocks).toHaveLength(3);
  expect(scene.edges).toHaveLength(3);
  expect(scene.edges.filter(edge => edge.resume)).toHaveLength(1);
  expect(scene.blocks[1]!.x).toBeGreaterThan(scene.blocks[0]!.x);
  expect(scene.blocks[2]!.y).toBeGreaterThanOrEqual(scene.blocks[1]!.y + scene.blocks[1]!.height);
  expect(scene.blocks.every(block => block.x + 370 < scene.width && block.y + block.height < scene.height)).toBe(true);
  const runner = new TraceRunner({ repo: "/repo", base: "base", head: "head", files: [] });
  expect(() => runner.start(["--help"])).toThrow("Select changed pytest tests");
  runner.state.status = "running";
  expect(() => runner.start([])).toThrow("already running");
});
