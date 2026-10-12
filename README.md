# Princess

Python-first code review visualization: an ast-grep structural change tree and before/after function control-flow graphs from [Function Graph Overview](https://github.com/tmr232/function-graph-overview).

## Run

Requires Bun and Git. ast-grep 0.50.0 is installed as a local dependency.

```sh
bun install
bun run build
bun run review --repo /path/to/repository --base main --head HEAD
```

Open the printed browser URL. Use `--port 3000` for a fixed port. The server defaults to loopback; `--host 0.0.0.0` is for trusted environments only. It serves repository source to connected clients and has no authentication.

Select a changed function or method to see independent before/after graphs. Scroll to zoom and drag to pan. Detailed labels expose the explorer's verbose node labels. Added/removed functions have one empty side. Classes roll up changes to their definitions and children. Module-level entries cover edits outside definitions; other file types are listed without structural analysis.

## Scope and semantics

- Compares the two commit snapshots directly (not merge-base/PR semantics); never checks out revisions or executes reviewed Python.
- Git identifies changed files and file renames. ast-grep outline supplies the structural inventory. Tree-sitter supplements nested definitions, decorator ranges, and graph selection.
- Definitions are paired by qualified name and kind (renames appear as add/remove); repeated names use occurrence order. Exact definition-text comparison includes body, decorators, comments, and formatting. Classes and enclosing functions roll up child changes.
- Changes outside recognized definitions appear as module-level changes. Syntax errors stop analysis with an explicit error rather than silently omitting results.
- No node matching, graph-diff highlighting, VS Code integration, working-tree comparison, or semantic rename detection yet.
- Graphs are control-flow overviews, not exhaustive Python execution models. Analysis stays local; browser assets are served locally with no CDN.

```sh
bun run check
bun test
```

Upstream engine attribution and pinned revision are in `vendor/explorer/`.
