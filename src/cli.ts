import { resolveComparison } from "./comparison";
import { TraceRunner } from "./trace";
import { CoverageRunner } from "./coverage";
import { Command } from "commander";
import { resolve, sep } from "node:path";
import { createReview, createInterface } from "./review";

const options = new Command()
  .name("princess")
  .description(
    "Review branch changes from the default-branch merge-base, or compare two commits",
  )
  .requiredOption("--repo <path>")
  .option("--base <revision>", "Compare directly against this revision")
  .option("--merge-base <revision>", "Use the merge-base with this branch/revision (default: repository default branch)")
  .option("--head <revision>", "Head revision", "HEAD")
  .option(
    "--port <number>",
    "Local HTTP port (0 chooses an available port)",
    "0",
  )
  .option("--host <address>", "Bind address", "127.0.0.1")
  .parse()
  .opts();
try {
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid port");
  const root = resolve(import.meta.dir, "../dist");
  if (!(await Bun.file(resolve(root, "index.html")).exists()))
    throw new Error("Build the browser UI first: bun run build");
  const comparison = await resolveComparison(options.repo, options);
  const { review, sources } = await createReview(options.repo, comparison.base, comparison.head);
  const coverage = new CoverageRunner(review, sources);
  const trace = new TraceRunner(review, sources);
  const server = Bun.serve({
    hostname: options.host,
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/coverage" || url.pathname === "/api/trace") {
        const runner = url.pathname === "/api/trace" ? trace : coverage;
        if (request.method === "GET") return Response.json(runner.state);
        if (request.method === "POST") {
          if (request.headers.get("origin") !== url.origin)
            return new Response("Same-origin request required", { status: 403 });
          try {
            const body = await request.json();
            if (!Array.isArray(body.tests) || body.tests.some((id: unknown) => typeof id !== "string"))
              return new Response("Expected test node IDs", { status: 400 });
            if (coverage.state.status === "running" || trace.state.status === "running")
              return Response.json({ error: "A test run is already in progress" }, { status: 409 });
            runner.start(body.tests);
            return Response.json(runner.state, { status: 202 });
          } catch (error) {
            return Response.json({ error: String(error) }, { status: runner.state.status === "running" ? 409 : 400 });
          }
        }
      }
      if (request.method !== "GET")
        return new Response("Method not allowed", { status: 405 });
      if (url.pathname === "/api/review") return Response.json(review);
      if (url.pathname.startsWith("/api/source/")) {
        const id = url.pathname.slice("/api/source/".length);
        const source = sources.get(id);
        if (!source) return new Response("Not found", { status: 404 });
        if (url.searchParams.get("view") !== "interface")
          return Response.json(source);
        const symbol = url.searchParams.get("symbol");
        const change = symbol
          ? review.files
              .find((f) => f.id === id)
              ?.changes.find((c) => c.id === symbol)
          : null;
        if (symbol && change?.kind !== "class")
          return new Response("Interface selection must be a class or module", {
            status: 400,
          });
        const filters = {
          showPrivate: url.searchParams.get("private") === "1",
          showDocstrings: url.searchParams.get("docstrings") === "1",
        };
        const beforeLines: (number | null)[] = [];
        const afterLines: (number | null)[] = [];
        return Response.json({
          before:
            source.before === null || (change && !change.before)
              ? null
              : await createInterface(
                  source.before,
                  filters,
                  change?.before?.line,
                  beforeLines,
                ),
          after:
            source.after === null || (change && !change.after)
              ? null
              : await createInterface(
                  source.after,
                  filters,
                  change?.after?.line,
                  afterLines,
                ),
          beforeLines,
          afterLines,
        });
      }
      const path = resolve(
        root,
        `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
      );
      if (!path.startsWith(root + sep))
        return new Response("Forbidden", { status: 403 });
      const file = Bun.file(path);
      return (await file.exists())
        ? new Response(file)
        : new Response("Not found", { status: 404 });
    },
  });
  console.log(
    `Princess: ${server.url}\n${review.files.length} changed files · ${review.base.slice(0, 8)} → ${review.head.slice(0, 8)}${comparison.target ? `\nMerge-base with ${comparison.target.replace(/^refs\/(remotes|heads)\//, "")} · target ${comparison.targetHead!.slice(0, 8)}` : ""}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
