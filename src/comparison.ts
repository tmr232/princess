import { resolve } from "node:path";

async function git(repo: string, args: string[]) {
  const process = Bun.spawn(["git", "--no-pager", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  const [out, error, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  return { out: out.trim(), error: error.trim(), code };
}
async function commit(repo: string, ref: string) {
  const result = await git(repo, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  if (result.code) throw new Error(`Cannot resolve revision ${JSON.stringify(ref)}: ${result.error}`);
  return result.out;
}

export async function defaultBranch(repo: string) {
  const remotes = await git(repo, ["remote"]);
  if (remotes.code) throw new Error(`Cannot read repository remotes: ${remotes.error}`);
  const names = remotes.out ? remotes.out.split("\n") : [];
  // Prefer the repository's origin metadata; a sole alternative remote works too.
  const remote = names.includes("origin") ? "origin" : names.length === 1 ? names[0] : undefined;
  if (remote) {
    const symbolic = await git(repo, ["symbolic-ref", "--quiet", `refs/remotes/${remote}/HEAD`]);
    if (!symbolic.code) {
      const result = await git(repo, ["rev-parse", "--verify", "--end-of-options", `${symbolic.out}^{commit}`]);
      if (result.code) throw new Error(`Default branch ${symbolic.out} is not available locally. Fetch its ref or choose --merge-base <revision>.`);
      return symbolic.out;
    }
  }
  for (const name of ["main", "master"]) {
    const candidates = [...(remote ? [`refs/remotes/${remote}/${name}`] : []), `refs/heads/${name}`];
    for (const ref of candidates) {
      if (!(await git(repo, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).code) return ref;
    }
  }
  throw new Error("Cannot determine the default branch from local refs. Set the remote HEAD or choose --merge-base <revision> (or --base for a direct comparison).");
}

export async function resolveComparison(repoPath: string, options: { base?: string; head?: string; mergeBase?: string } = {}) {
  if (options.base !== undefined && options.mergeBase !== undefined) throw new Error("Use either --base or --merge-base, not both");
  const repo = resolve(repoPath);
  // Pin both revisions before creating the review, even if a branch moves later.
  const head = await commit(repo, options.head ?? "HEAD");
  if (options.base !== undefined) return { base: await commit(repo, options.base), head };
  const target = options.mergeBase ?? await defaultBranch(repo);
  const targetHead = await commit(repo, target);
  const result = await git(repo, ["merge-base", "--all", head, targetHead]);
  if (result.code === 1) throw new Error(`No merge-base between head and ${target}. Check that the branches share history and that the local history is complete.`);
  if (result.code) throw new Error(`Cannot compute merge-base: ${result.error}`);
  const bases = result.out.split("\n").filter(Boolean);
  if (bases.length !== 1) throw new Error(`Multiple merge bases with ${target}; choose an explicit --base <revision>.`);
  return { base: bases[0]!, head, target, targetHead };
}
