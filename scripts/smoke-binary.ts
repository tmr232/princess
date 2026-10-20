import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { strict as assert } from "node:assert";

// Only the compiled executable is copied: no dist, node_modules or source files.
const directory = await mkdtemp(join(tmpdir(), "princess-smoke-"));
let process: Bun.Subprocess<"ignore", "pipe", "inherit"> | undefined;
const timeout = setTimeout(() => process?.kill(), 120_000);
try {
  const binary = join(directory, Bun.argv[2]!.endsWith(".exe") ? "princess.exe" : "princess");
  await copyFile(resolve(Bun.argv[2]!), binary);
  function git(...args: string[]) {
    const result = Bun.spawnSync(["git", ...args], { cwd: directory });
    assert.equal(result.exitCode, 0, result.stderr.toString());
  }
  git("init", "-q");
  git("config", "user.name", "Princess smoke test");
  git("config", "user.email", "test@example.invalid");
  await writeFile(join(directory, "example.py"), "def hello(value: int):\n    return value + 1\n");
  git("add", "example.py");
  git("commit", "-qm", "before");
  await writeFile(join(directory, "example.py"), "def hello(value: int):\n    return value + 2\n");
  await writeFile(join(directory, "test_example.py"), "from example import hello\n\ndef test_hello():\n    assert hello(3) == 5\n");
  await writeFile(join(directory, "pyproject.toml"), '[project]\nname = "princess-smoke"\nversion = "0.0.0"\nrequires-python = ">=3.11"\ndependencies = ["pytest", "pytest-cov"]\n');
  git("add", "example.py", "test_example.py", "pyproject.toml");
  git("commit", "-qm", "after");
  process = Bun.spawn([binary, "--repo", directory, "--base", "HEAD~1"], {
    cwd: directory, stdin: "ignore", stdout: "pipe", stderr: "inherit",
  });
  const reader = process.stdout!.getReader();
  let output = "";
  const url = await (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`Binary exited before serving: ${output}`);
      output += new TextDecoder().decode(value);
      const match = output.match(/Princess: (http:\/\/\S+)/);
      if (match) return match[1]!;
    }
  })();
  const page = await fetch(url).then((r) => r.text());
  assert.match(page, /<html/);
  for (const match of page.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    const response = await fetch(new URL(match[1]!, url));
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  const review = await fetch(new URL("/api/review", url)).then((r) => r.json());
  assert.equal(review.files[0].changes[0].name, "hello");
  assert.equal(review.files[0].changes[0].status, "modified");
  const source = await fetch(new URL("/api/source/0?view=interface", url)).then((r) => r.json());
  assert.match(source.after, /def hello\(value: int\)/);
  assert.ok(!source.after.includes("return value"));
  for (const mode of ["coverage", "trace"]) {
    const endpoint = new URL(`/api/${mode}`, url);
    const response = await fetch(endpoint, {
      method: "POST", headers: { origin: endpoint.origin, "content-type": "application/json" },
      body: JSON.stringify({ tests: ["test_example.py::test_hello"] }),
    });
    assert.equal(response.status, 202);
    let state = await response.json();
    const deadline = Date.now() + 90_000;
    while (state.status === "running" && Date.now() < deadline) {
      await Bun.sleep(100);
      state = await fetch(endpoint).then(r => r.json());
    }
    assert.equal(state.status, "complete", `${mode}: ${state.error}\n${state.output}`);
    assert.equal(state.exitCode, 0, state.output);
    if (mode === "coverage") {
      assert.deepEqual(state.functions.find((fn: any) => fn.name === "hello").covered, [2]);
    } else {
      assert.equal(state.tests[0].outcome, "passed");
      assert.ok(state.functions.some((fn: any) => fn.name === "hello"));
      assert.ok(state.tests[0].calls.length > 0);
    }
  }
  console.log("Standalone binary smoke test passed (analysis, UI assets, coverage and callgraphs)");
} finally {
  clearTimeout(timeout);
  process?.kill();
  if (process) await process.exited;
  await rm(directory, { recursive: true, force: true });
}
