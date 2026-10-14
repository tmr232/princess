import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testTargets } from "./testTargets";
export { testTargets } from "./testTargets";
import { analyze } from "./review";
import type { SymbolInfo } from "./model";
import type { Review } from "./model";

export type TestTarget = { nodeid: string; fileId: string; changeId: string };
export type FunctionCoverage = {
  fileId: string; changeId: string; name: string; path: string;
  tests: string[]; executable: number[]; covered: number[];
  contexts: Record<string, string[]>;
};
export type CoverageState = {
  status: "idle" | "running" | "complete" | "error";
  targets: TestTarget[]; selected: string[]; command: string;
  output: string; error?: string; exitCode?: number; functions: FunctionCoverage[]; report?: CoverageReport;
};


export type CoverageReport = { files: Record<string, { executed_lines: number[]; missing_lines: number[]; contexts?: Record<string, string[]> }> };
export function mapCoverage(review: Review, sources: Map<string, { after: string | null }>, report: CoverageReport, inventories = new Map<string, SymbolInfo[]>()): FunctionCoverage[] {
  return review.files.flatMap(file => file.changes.flatMap(change => {
    const symbol = change.after, source = sources.get(file.id)?.after;
    if (change.kind !== "function" || !symbol || !source) return [];
    const data = report.files[file.path];
    // Only body execution establishes attribution; importing a def/decorator does not.
    const signatureEnd = source.indexOf(symbol.signature, symbol.start) + symbol.signature.length;
    const sameLineBody = source.slice(signatureEnd).split("\n")[0]!.trim();
    const bodyStart = symbol.line + symbol.signature.split("\n").length - (sameLineBody && !sameLineBody.startsWith("#") ? 1 : 0);
    const children = (inventories.get(file.id) ?? []).filter(child => child.start > symbol.start && child.end <= symbol.end);
    const childLines = new Set(children.flatMap(child => {
      const start = source.slice(0, child.start).split("\n").length;
      const end = source.slice(0, child.end).split("\n").length;
      return Array.from({length: end - start + 1}, (_, i) => start + i);
    }));
    const end = source.slice(0, symbol.end).split("\n").length;
    const lines = [...new Set([...(data?.executed_lines ?? []), ...(data?.missing_lines ?? [])])]
      .filter(line => line >= bodyStart && line <= end && !childLines.has(line)).sort((a,b) => a-b);
    const contexts: Record<string, string[]> = {};
    for (const line of lines) contexts[String(line)] = [...new Set((data?.contexts?.[String(line)] ?? [])
      .filter(context => context.endsWith("|run")).map(context => context.slice(0, -4)))].sort();
    return [{ fileId: file.id, changeId: change.id, name: symbol.id, path: file.path,
      executable: lines, covered: lines.filter(line => contexts[String(line)]!.length),
      contexts, tests: [...new Set(Object.values(contexts).flat())].sort() }];
  }));
}

export class CoverageRunner {
  state: CoverageState;
  constructor(private review: Review, private sources: Map<string, { after: string | null }>) {
    this.state = { status: "idle", targets: testTargets(review), selected: [], command: "", output: "", functions: [] };
  }
  start(selected: string[]) {
    if (this.state.status === "running") throw new Error("Coverage is already running");
    if (!selected.length || selected.some(id => !this.state.targets.some(t => t.nodeid === id)))
      throw new Error("Select changed pytest tests from this review");
    const ids = [...new Set(selected)];
    this.state = { ...this.state, status: "running", selected: ids, command: `uv run pytest ${ids.map(id => JSON.stringify(id)).join(" ")} --cov=. --cov-context=test --cov-report=`, output: "", error: undefined, exitCode: undefined, report: undefined, functions: [] };
    void this.execute(ids);
  }
  private async execute(ids: string[]) {
    let folder: string | undefined;
    const state = this.state;
    try {
      folder = await mkdtemp(join(tmpdir(), "princess-coverage-"));
      const snapshot = join(folder, "repo");
      await this.run(["mkdir", snapshot], folder);
      const archive = Bun.spawn(["git", "archive", "--format=tar", this.review.head], { cwd: this.review.repo, stdout: "pipe", stderr: "pipe" });
      const extraction = Bun.spawn(["tar", "-xf", "-", "-C", snapshot], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" });
      const errors = await Promise.all([new Response(archive.stderr).text(), new Response(extraction.stderr).text()]);
      if ((await archive.exited) || (await extraction.exited)) throw new Error(errors.join("\n"));
      const rc = join(folder, "coverage.ini"), data = join(folder, ".coverage"), json = join(folder, "coverage.json");
      await writeFile(rc, "[run]\nrelative_files = True\n[json]\nshow_contexts = True\n");
      const env = { ...process.env, COVERAGE_FILE: data, UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? join(tmpdir(), "princess-uv-cache") };
      state.exitCode = await this.run(["uv", "run", "pytest", ...ids, "--cov=.", "--cov-context=test", "--cov-report=", `--cov-config=${rc}`], snapshot, env, true);
      await this.run(["uv", "run", "python", "-m", "coverage", "json", "--show-contexts", `--rcfile=${rc}`, "-o", json], snapshot, env);
      const inventories = new Map<string, SymbolInfo[]>();
      for (const [id, source] of this.sources) if (source.after) inventories.set(id, await analyze(source.after));
      state.report = await Bun.file(json).json();
      state.functions = mapCoverage(this.review, this.sources, state.report!, inventories);
      state.status = "complete";
    } catch (error) {
      state.status = "error";
      state.error = `${error instanceof Error ? error.message : error}\nRequires uv, pytest and pytest-cov in the reviewed project's environment. Add pytest-cov to its test dependencies if missing.`;
    } finally {
      if (folder) await rm(folder, { recursive: true, force: true });
    }
  }
  private async run(args: string[], cwd: string, env = process.env, allowFailure = false) {
    const proc = Bun.spawn(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), 300_000);
    const consume = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) this.state.output = (this.state.output + decoder.decode(chunk, { stream: true })).slice(-100_000);
    };
    try {
      await Promise.all([consume(proc.stdout), consume(proc.stderr)]);
      const code = await proc.exited;
      if (code && !allowFailure) throw new Error(`${args.slice(0, 3).join(" ")} failed (exit ${code}). See run output.`);
      return code;
    } finally { clearTimeout(timer); }
  }
}
