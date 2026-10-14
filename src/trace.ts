import { mkdtemp, rm, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { z } from "zod";
import type { Review } from "./model";
import type { TestTarget } from "./coverage";
import { testTargets } from "./testTargets";
import { snapshot, pytestCommand } from "./pytestRuntime";

const callSchema = z.object({ id: z.number().int().positive(), functionId: z.string(), parentId: z.number().nullable(), callLine: z.number().nullable(), thread: z.number(), entryOrder: z.number(), exitOrder: z.number().optional(), kind: z.enum(["call", "resume"]), resumeFrom: z.number().nullable(), suspended: z.boolean().optional() });
const functionSchema = z.object({ id: z.string(), name: z.string(), path: z.string(), line: z.number(), endLine: z.number(), source: z.string() });
export const traceReportSchema = z.object({ functions: z.array(functionSchema), tests: z.array(z.object({ nodeid: z.string(), outcome: z.string(), calls: z.array(callSchema), truncated: z.boolean() })) });
export type TraceCall = z.infer<typeof callSchema>;
export type TraceFunction = z.infer<typeof functionSchema> & { change?: "added" | "modified" };
export type TestTrace = z.infer<typeof traceReportSchema>["tests"][number];
export type TraceState = { status: "idle" | "running" | "complete" | "error"; targets: TestTarget[]; selected: string[]; command: string; output: string; error?: string; exitCode?: number; functions: TraceFunction[]; tests: TestTrace[] };

export class TraceRunner {
  state: TraceState;
  constructor(private review: Review, private sources = new Map<string, { after: string | null }>()) {
    this.state = { status: "idle", targets: testTargets(review), selected: [], command: "", output: "", functions: [], tests: [] };
  }
  start(selected: string[]) {
    if (this.state.status === "running") throw new Error("Tracing is already running");
    if (!selected.length || selected.some(id => !this.state.targets.some(target => target.nodeid === id))) throw new Error("Select changed pytest tests from this review");
    const ids = [...new Set(selected)];
    this.state = { status: "running", targets: this.state.targets, selected: ids, command: `uv run pytest ${ids.map(id => JSON.stringify(id)).join(" ")} -p princess_trace -p no:pytest_cov -o addopts=`, output: "", functions: [], tests: [] };
    void this.execute(ids);
  }
  private async execute(ids: string[]) {
    const state = this.state;
    let folder: string | undefined;
    try {
      folder = await mkdtemp(join(tmpdir(), "princess-trace-"));
      const cwd = join(folder, "repo");
      await snapshot(this.review.repo, this.review.head, cwd);
      await copyFile(join(import.meta.dir, "python/princess_trace.py"), join(folder, "princess_trace.py"));
      const listing = Bun.spawnSync(["git", "ls-tree", "-r", "--name-only", "-z", this.review.head], { cwd: this.review.repo });
      if (listing.exitCode) throw new Error("Unable to list snapshot files");
      const files = listing.stdout.toString().split("\0").filter(path => path.endsWith(".py"));
      const manifest = join(folder, "files.json");
      await writeFile(manifest, JSON.stringify(files));
      const output = join(folder, "trace.json");
      state.exitCode = await pytestCommand(["uv", "run", "pytest", ...ids, "-p", "princess_trace", "-p", "no:pytest_cov", "-o", "addopts="], cwd, {
        ...process.env, PYTEST_ADDOPTS: "", PYTHONPATH: [folder, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
        PRINCESS_TRACE_ROOT: cwd, PRINCESS_TRACE_MANIFEST: manifest, PRINCESS_TRACE_OUTPUT: output,
        UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? join(tmpdir(), "princess-uv-cache"),
      }, text => { state.output = (state.output + text).slice(-100_000); });
      const report = traceReportSchema.parse(await Bun.file(output).json());
      state.functions = report.functions.map(fn => {
        const file = this.review.files.find(file => file.path === fn.path);
        const source = file && this.sources.get(file.id)?.after;
        const change = file?.changes.find(change => {
          if (change.kind !== "function" || !change.after || !source) return false;
          const startLine = source.slice(0, change.after.start).split("\n").length;
          return fn.line >= startLine && fn.line <= change.after.line;
        });
        return { ...fn, ...(change && change.status !== "removed" ? { change: change.status } : {}) };
      });
      state.tests = report.tests;
      state.status = "complete";
    } catch (error) {
      state.status = "error";
      state.error = `${error instanceof Error ? error.message : error}\nTracing requires uv and pytest in the reviewed project.`;
    } finally { if (folder) await rm(folder, { recursive: true, force: true }); }
  }
}
