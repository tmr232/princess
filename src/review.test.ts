import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReview } from "./review";

test("compares snapshot structure, including bodies, decorators, nested definitions and missing sides", async () => {
  const repo = await mkdtemp(join(tmpdir(), "princess-test-"));
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  const before = `TITLE = "שלום 🌍"

class Service:
    def fetch(self, key):
        if key:
            return key
        return None

@cache(1)
def decorated(x):
    return x

def outer(x):
    def inner(y):
        return y + 1
    return inner(x)

def removed(x):
    return x - 1

def stable(x):
    return x * 7
`;
  const after = before
    .replace('TITLE = "שלום 🌍"', 'TITLE = "שלום 🌍!"')
    .replace("return key", "return key.strip()")
    .replace("@cache(1)", "@cache(2)")
    .replace("return y + 1", "return y + 3")
    .replace(
      "def removed(x):\n    return x - 1",
      "def added(x):\n    return x + 2",
    );
  try {
    git("init", "-q");
    git("config", "user.name", "Princess test");
    git("config", "user.email", "test@example.invalid");
    await writeFile(join(repo, "service file.py"), before);
    await writeFile(
      join(repo, "deleted.py"),
      "def vanished():\n    return 1\n",
    );
    await writeFile(join(repo, "rename.py"), "def moved():\n    return 8\n");
    await writeFile(
      join(repo, "repeated.py"),
      "def f():\n    return 1\n\ndef f():\n    def inner():\n        return 2\n    return inner()\n\ndef f():\n    return 3\n",
    );
    await writeFile(
      join(repo, "shape.py"),
      "def Shape():\n    def member():\n        return 1\n    return member()\n",
    );
    git("add", ".");
    git("commit", "-qm", "before");
    const base = git("rev-parse", "HEAD");
    await writeFile(join(repo, "service file.py"), after);
    await rm(join(repo, "deleted.py"));
    await rename(join(repo, "rename.py"), join(repo, "renamed.py"));
    await writeFile(join(repo, "new.py"), "def fresh():\n    return 9\n");
    await writeFile(join(repo, "notes.txt"), "Not Python");
    await writeFile(
      join(repo, "repeated.py"),
      "def f():\n    return 1\n\ndef f():\n    return 2\n\ndef f():\n    return 3\n",
    );
    await writeFile(
      join(repo, "shape.py"),
      "class Shape:\n    def member():\n        return 2\n",
    );
    git("add", ".");
    git("commit", "-qm", "after");
    // A dirty worktree must not affect either revision.
    await writeFile(join(repo, "service file.py"), "not valid Python!");
    const { review, sources } = await createReview(repo, base, "HEAD");
    const file = review.files.find((f) => f.path === "service file.py")!;
    expect(file.changes.map((c) => [c.name, c.status])).toEqual([
      ["Service", "modified"],
      ["fetch", "modified"],
      ["decorated", "modified"],
      ["outer", "modified"],
      ["inner", "modified"],
      ["removed", "removed"],
      ["added", "added"],
      ["Module-level changes", "modified"],
    ]);
    const decorator = file.changes.find((c) => c.name === "decorated")!;
    expect(before.slice(decorator.before!.start, decorator.before!.end)).toBe(
      "@cache(1)\ndef decorated(x):\n    return x",
    );
    expect(sources.get(file.id)).toEqual({ before, after });
    expect(file.changes.find((c) => c.name === "inner")!.parent).toBe("outer");
    expect(file.changes.find((c) => c.name === "added")!.before).toBeNull();
    expect(file.changes.find((c) => c.name === "removed")!.after).toBeNull();
    expect(
      review.files.find((f) => f.path === "new.py")!.changes[0]!.status,
    ).toBe("added");
    expect(
      review.files.find((f) => f.path === "deleted.py")!.changes[0]!.status,
    ).toBe("removed");
    expect(review.files.find((f) => f.path === "renamed.py")!.oldPath).toBe(
      "rename.py",
    );
    expect(review.files.find((f) => f.path === "renamed.py")!.changes).toEqual(
      [],
    );
    expect(review.files.find((f) => f.path === "notes.txt")!.supported).toBe(
      false,
    );
    expect(
      review.files
        .find((f) => f.path === "repeated.py")!
        .changes.filter((c) => c.kind === "function")
        .map((c) => [c.id, c.status]),
    ).toEqual([
      ["function:f#2", "modified"],
      ["function:f#2.inner", "removed"],
    ]);
    expect(
      review.files
        .find((f) => f.path === "shape.py")!
        .changes.map((c) => [c.kind, c.name, c.status]),
    ).toEqual([
      ["function", "Shape", "removed"],
      ["function", "member", "modified"],
      ["class", "Shape", "added"],
    ]);
    expect((await createReview(repo, base, base)).review.files).toEqual([]);
    git("add", ".");
    git("commit", "-qm", "invalid syntax");
    await expect(createReview(repo, "HEAD~1", "HEAD")).rejects.toThrow(
      "invalid Python syntax",
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
