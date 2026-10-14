import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveComparison } from "./comparison";
import { createReview } from "./review";

test("default merge-base excludes unrelated main changes and preserves explicit comparisons", async () => {
  const repo = await mkdtemp(join(tmpdir(), "comparison-test-"));
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  try {
    git("init", "-qb", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid");
    await writeFile(join(repo,"service.py"), "def work():\n    return 1\n");
    git("add", "."); git("commit", "-qm", "common ancestor"); const ancestor = git("rev-parse", "HEAD");
    git("switch", "-qc", "feature");
    await writeFile(join(repo,"service.py"), "def work():\n    return 2\n");
    git("add", "."); git("commit", "-qm", "feature change"); const head = git("rev-parse", "HEAD");
    git("switch", "-q", "main");
    await writeFile(join(repo,"main_only.py"), "def other():\n    return 3\n");
    git("add", "."); git("commit", "-qm", "main advances"); const main = git("rev-parse", "HEAD"); git("switch", "-q", "feature");
    const automatic = await resolveComparison(repo);
    expect(automatic.base).toBe(ancestor); expect(automatic.head).toBe(head); expect(automatic.target).toBe("refs/heads/main");
    const { review } = await createReview(repo, automatic.base, automatic.head);
    expect(review.files.map(file => file.path)).toEqual(["service.py"]);
    expect((await resolveComparison(repo, { base:"main" })).base).toBe(main);
    expect((await resolveComparison(repo, { mergeBase:"main" })).base).toBe(ancestor);
    expect((await resolveComparison(repo, { mergeBase:"main", head:"main" })).base).toBe(main);
    git("switch", "-q", "--detach", head);
    expect((await resolveComparison(repo)).head).toBe(head);
    git("switch", "-q", "feature");
    git("remote", "add", "origin", "/unused-local-remote");
    git("update-ref", "refs/remotes/origin/trunk", main); git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    expect((await resolveComparison(repo)).target).toBe("refs/remotes/origin/trunk");
    git("update-ref", "-d", "refs/remotes/origin/trunk");
    await expect(resolveComparison(repo)).rejects.toThrow("not available locally");
    git("symbolic-ref", "--delete", "refs/remotes/origin/HEAD"); git("update-ref", "refs/remotes/origin/main", main);
    expect((await resolveComparison(repo)).target).toBe("refs/remotes/origin/main");
    git("update-ref", "-d", "refs/remotes/origin/main"); git("branch", "-m", "main", "master");
    expect((await resolveComparison(repo)).target).toBe("refs/heads/master");
    await expect(resolveComparison(repo, {base:"master",mergeBase:"master"})).rejects.toThrow("either --base or --merge-base");
    await expect(resolveComparison(repo, {mergeBase:"missing"})).rejects.toThrow("Cannot resolve revision");
    const tree = git("rev-parse", `${ancestor}^{tree}`);
    const a = git("commit-tree", tree, "-p", ancestor, "-m", "side A");
    const b = git("commit-tree", tree, "-p", ancestor, "-m", "side B");
    const ab = git("commit-tree", tree, "-p", a, "-p", b, "-m", "merge AB");
    const ba = git("commit-tree", tree, "-p", b, "-p", a, "-m", "merge BA");
    await expect(resolveComparison(repo, {head:ab,mergeBase:ba})).rejects.toThrow("Multiple merge bases");
    git("branch", "-m", "master", "trunk");
    await expect(resolveComparison(repo)).rejects.toThrow("Cannot determine the default branch");
    git("checkout", "-q", "--orphan", "unrelated"); git("commit", "-qm", "unrelated root"); git("switch", "-q", "feature");
    await expect(resolveComparison(repo, {mergeBase:"unrelated"})).rejects.toThrow("No merge-base");
  } finally { await rm(repo, { recursive:true, force:true }); }
});
