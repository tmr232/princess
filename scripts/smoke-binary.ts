import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { strict as assert } from "node:assert";

// Only the compiled executable is copied: no dist, node_modules or source files.
const directory = await mkdtemp(join(tmpdir(), "princess-smoke-"));
let process: Bun.Subprocess<"ignore", "pipe", "inherit"> | undefined;
const timeout = setTimeout(() => process?.kill(), 30_000);
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
  git("commit", "-qam", "after");
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
  console.log("Standalone binary smoke test passed (Python analysis, interface API, embedded UI assets)");
} finally {
  clearTimeout(timeout);
  process?.kill();
  if (process) await process.exited;
  await rm(directory, { recursive: true, force: true });
}
