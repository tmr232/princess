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

Select a changed function or method to see independent before/after graphs with concise labels. Scroll to zoom and drag to pan. Added/removed functions have one empty side. Classes roll up changes to their definitions and children. Module-level entries cover edits outside definitions; other file types are listed without structural analysis.

Choose **Single function / All functions** to set the review scope. Single function offers **Graph / Code diff / Code + graph** views and remembers the chosen view when returning from All functions. Function signatures appear above each graph, including multiline declarations and type annotations. **Code + graph** shows the selected function's code diff above its graphs. **All functions** provides a scrollable list of every changed function across all files, with each before/after pair top-aligned at the same scale. Wheel scrolling navigates the list rather than zooming individual graphs. These are control-flow comparisons, not node-matched graph diffs.

Each graph card has a **Focus function** button that opens that function in **Code + graph**. **Back to all function graphs** returns to the same scroll position and restores keyboard focus to the originating card, without regenerating the list.

The [Pierre diff viewer](https://diffs.com/) shows only the selected function or class, including decorators, with original file line numbers. Click a Python file heading (or its module-level entry) to review the entire module. Added/removed definitions and modules have one missing side.

Class and module code diffs default to **Interface**, a generated pyi-like projection retaining imports, class bases, decorators, annotations, type aliases, and function signatures (including defaults). Implementations and variable initializers become `...`; runtime statements and definitions inside function bodies are omitted. **Show private members** and **Show docstrings** are independent filters, both off by default. `_name` declarations are private; dunder names such as `__init__` remain visible. Imports remain as annotation context regardless of the privacy filter. Docstrings include module, class, and function documentation. **Full source** restores the unfiltered original text, with no collapsing. Function-only selections always show their full source.

Interfaces preserve original source line numbers even when declarations or bodies are omitted. Generated blank lines and body placeholders have no source line number. Interfaces use two blank lines after import groups and one blank line between functions/classes and neighboring declarations; decorators stay attached to their definitions. Full source keeps its original formatting. This is a static review projection, not a type-inferred stub or a resolution of dynamic exports/instance attributes. A notice identifies identical visible interfaces: omitted implementation, initializers, or filtered members/docstrings can still have changes in the full source.

All code diffs offer **Side-by-side** (the default) and **Inline** layouts. The layout choice is retained across selections and Interface / Full source switches, without changing the source or filters. Unchanged interfaces appear in both columns side-by-side, or once in inline mode.

## Scope and semantics

- Compares the two commit snapshots directly (not merge-base/PR semantics); static review does not execute Python. Coverage runs execute the reviewed head snapshot only when explicitly triggered.
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

## On-demand pytest coverage

Expand **Pytest coverage**, choose the added or modified tests, and click **Run selected tests with coverage**. Princess runs `uv run pytest <node IDs> --cov=. --cov-context=test --cov-report=` against a temporary Git archive of the reviewed head commit. Your checkout is untouched. The reviewed project must provide pytest and pytest-cov through its uv environment; dependency installation follows normal `uv run` behavior. The runner is fixed for now.

Tests are detected using conventional `test_*.py` / `*_test.py` filenames and `test*` functions, including methods on `Test*` classes. Removed tests and nested helper functions are excluded. Selecting a parametrized test runs all its cases; results retain individual case IDs. Custom pytest collection naming is not supported yet.

Select a changed function to see which tests reached its body, or expand **All changed functions** to see the mapping for the whole change. Import/definition execution and setup/teardown contexts are excluded. Nested function bodies are attributed to their own function. A reached function can still have uncovered lines or branches. Removed functions have no head coverage. Failed pytest runs retain any available coverage and show the exit code; tool/dependency errors show run output. Runs time out after five minutes per command; concurrent runs are rejected.

`GET /api/coverage` includes per-function executable/covered lines and per-line test contexts for future line-level visualization. **Download coverage JSON** exports revision IDs, selections, function mappings, and the complete raw line-context report. Results remain in server memory until the next run or server shutdown. The API accepts only test selectors detected in the current review, and starting a run requires a same-origin POST. The existing local server trust model still applies: coverage executes repository code, and an isolated snapshot is not a security sandbox.

### Reproduce the demo

```sh
python examples/coverage-demo/create.py /tmp/princess-coverage-demo
bun run build
bun run review --repo /tmp/princess-coverage-demo --base HEAD~ --head HEAD --port 3001
```

The demo adds bulk pricing and two changed tests. Running both test selectors executes three cases, covers `price`, and leaves `refund` unreached. Running only `test_regular` reaches two of the three executable lines in `price`. Screenshots and an example context report are in `artifacts/`.
