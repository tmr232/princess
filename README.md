# Princess

Python-first code review visualization: an ast-grep structural change tree and before/after function control-flow graphs from [Function Graph Overview](https://github.com/tmr232/function-graph-overview).

## Standalone binaries

The **Build binaries** GitHub Actions workflow builds Linux (glibc), macOS, and Windows executables for x64 and ARM64. It runs on pull requests, pushes to `main`, and manual dispatch. Download the archive for your platform from the workflow run's **Artifacts** section and extract it (using `tar -xzf princess-<platform>.tar.gz`). Tagged releases also publish these archives to GitHub Releases.

```sh
./princess --repo /path/to/repository --base main --head HEAD
```

On Windows, use `princess.exe`. Git must be installed and available on `PATH`; Bun, Node.js, and ast-grep do not need to be installed. The executable embeds the browser UI, WASM parsers, and native ast-grep. It extracts ast-grep to the system temporary directory at runtime, so that directory must allow executable files. These are unsigned builds.

To build for your current platform locally with Bun 1.3.10:

```sh
bun install --frozen-lockfile
bun run build:binary
bun scripts/smoke-binary.ts build/princess # build/princess.exe on Windows
```

### Publishing a release

Move the release's entries in `changelog.md` from **Unreleased** into a section headed `## [X.Y.Z] - YYYY-MM-DD`, then commit it and push a matching `vX.Y.Z` tag. The **Release** workflow validates that the matching section exists and is nonempty, runs the six-platform build and smoke tests, and publishes a GitHub Release with those notes and archives. Tags such as `v1.2.0-rc.1` create prereleases. A missing or empty changelog section blocks publication.

## Run

Requires Bun and Git. ast-grep 0.50.0 is installed as a local dependency.

```sh
bun install
bun run build
bun run review --repo /path/to/repository
```

Without `--base`, Princess compares the committed `HEAD` with its merge-base against the repository's default branch. It uses `origin/HEAD` (or a sole alternative remote's HEAD), then falls back to local remote-tracking/local `main` and `master` refs. No fetch or checkout is performed: comparison uses the refs already available locally. Uncommitted changes are excluded.

```sh
# Choose the branch whose merge-base should be used.
bun run review --repo /path/to/repository --merge-base main

# Preserve direct comparisons between arbitrary commits.
bun run review --repo /path/to/repository --base main --head HEAD
```

`--head <revision>` also works in merge-base mode. `--base` and `--merge-base` are mutually exclusive. Startup prints the chosen target and resolved commit IDs. Missing default-branch refs, unrelated/incomplete history, or multiple merge bases produce an explicit error; choose a target with `--merge-base` or an exact baseline with `--base` as appropriate.

Open the printed browser URL. Use `--port 3000` for a fixed port. The server defaults to loopback; `--host 0.0.0.0` is for trusted environments only. It serves repository source to connected clients and has no authentication.

The Review sidebar uses [Pierre Trees](https://www.npmjs.com/package/@pierre/trees), pinned to `1.0.0-beta.6` in this experimental branch. Directories, Python modules, classes, and nested functions form a collapsible tree. Search filters file and symbol paths; **Expand all** / **Collapse all** control the structure. Rows are virtualized, with keyboard navigation and sticky ancestors for large diffs. Select a Python file row to review the module, or a class/function row to review that definition. Native Git markers show A (added), D (removed), M (modified), and R (renamed). Non-Python files remain listed as file changes.

Select a changed function or method to see independent before/after graphs with concise labels. Scroll to zoom and drag to pan. Added/removed functions have one empty side. Classes roll up changes to their definitions and children. Module-level entries cover edits outside definitions; other file types are listed without structural analysis.

Choose **Single function / All functions** to set the review scope. Single function offers **Graph / Code diff / Code + graph** views and remembers the chosen view when returning from All functions. Function signatures appear above each graph, including multiline declarations and type annotations. **Code + graph** shows the selected function's code diff above its graphs. **All functions** provides a scrollable list of every changed function across all files, with each before/after pair top-aligned at the same scale. Wheel scrolling navigates the list rather than zooming individual graphs. These are control-flow comparisons, not node-matched graph diffs.

Each graph card has a **Focus function** button that opens that function in **Code + graph**. **Back to all function graphs** returns to the same scroll position and restores keyboard focus to the originating card, without regenerating the list.

The [Pierre diff viewer](https://diffs.com/) shows only the selected function or class, including decorators, with original file line numbers. Click a Python file heading (or its module-level entry) to review the entire module. Added/removed definitions and modules have one missing side.

Class and module code diffs default to **Interface**, a generated pyi-like projection retaining imports, class bases, decorators, annotations, type aliases, and function signatures (including defaults). Implementations and variable initializers become `...`; runtime statements and definitions inside function bodies are omitted. **Show private members** and **Show docstrings** are independent filters, both off by default. `_name` declarations are private; dunder names such as `__init__` remain visible. Imports remain as annotation context regardless of the privacy filter. Docstrings include module, class, and function documentation. **Full source** restores the unfiltered original text, with no collapsing. Function-only selections always show their full source.

Interfaces preserve original source line numbers even when declarations or bodies are omitted. Generated blank lines and body placeholders have no source line number. Interfaces use two blank lines after import groups and one blank line between functions/classes and neighboring declarations; decorators stay attached to their definitions. Full source keeps its original formatting. This is a static review projection, not a type-inferred stub or a resolution of dynamic exports/instance attributes. A notice identifies identical visible interfaces: omitted implementation, initializers, or filtered members/docstrings can still have changes in the full source.

All code diffs offer **Side-by-side** (the default) and **Inline** layouts. The layout choice is retained across selections and Interface / Full source switches, without changing the source or filters. Unchanged interfaces appear in both columns side-by-side, or once in inline mode.

## Scope and semantics

- Compares resolved commit snapshots: the default baseline is the default-branch merge-base; explicit `--base` preserves direct snapshot comparison. Static review does not execute Python. Coverage runs execute the reviewed head snapshot only when explicitly triggered.
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

Open the top-level **Tests & coverage** tab, choose the added or modified tests, and click **Run selected tests with coverage**. Princess runs `uv run pytest <node IDs> --cov=. --cov-context=test --cov-report=` against a temporary Git archive of the reviewed head commit. Your checkout is untouched. The reviewed project must provide pytest and pytest-cov through its uv environment; dependency installation follows normal `uv run` behavior. The runner is fixed for now.

Tests are detected using conventional `test_*.py` / `*_test.py` filenames and `test*` functions, including methods on `Test*` classes. Removed tests and nested helper functions are excluded. Selecting a parametrized test runs all its cases; results retain individual case IDs. Custom pytest collection naming is not supported yet.

The top-level **Tests & coverage** workspace has **Run tests** and **Explore coverage** modes. **View coverage on code**, or a function link in the run summary, opens the coverage explorer.

Coverage has its own navigation and head-only source viewer. **By test** lists changed tests (including individual parametrized cases) with the changed functions they reached beneath them. **By function** lists added/modified non-test functions with their covering changed tests beneath them. Unreached functions and tests without attributed calls remain navigable. Selecting a relationship shows the test's source alongside the function's source and highlights that test's reach. Function rows show aggregate coverage until a test is selected; **Show all covering tests** restores the aggregate view. Related-test/function buttons in the source cards provide the same navigation.

The coverage explorer uses green for lines reached by test calls, red for unexecuted lines (or lines missed by the selected test), and gray for lines executed outside test calls. Click a highlighted line, or focus its gutter and press Enter/Space, to inspect covering test IDs. Source slices retain original head line numbers and decorators. The **Review** tab keeps function diffs and graphs with its existing structure tree; coverage colors appear only in the separate coverage workspace.

Import/definition execution and setup/teardown contexts are excluded. Nested function bodies are attributed to their own function. A reached function can still have uncovered lines or branches. Removed functions have no head coverage. Failed pytest runs retain any available coverage and show the exit code; tool/dependency errors show run output. Runs time out after five minutes per command; concurrent runs are rejected.

`GET /api/coverage` includes per-function executable/covered lines and per-line test contexts for future line-level visualization. **Download coverage JSON** exports revision IDs, selections, function mappings, and the complete raw line-context report. Results remain in server memory until the next run or server shutdown. The API accepts only test selectors detected in the current review, and starting a run requires a same-origin POST. The existing local server trust model still applies: coverage executes repository code, and an isolated snapshot is not a security sandbox.

### Reproduce the demo

```sh
python examples/coverage-demo/create.py /tmp/princess-coverage-demo
bun run build
bun run review --repo /tmp/princess-coverage-demo --base HEAD~ --head HEAD --port 3001
```

The demo adds bulk pricing and two changed tests. Running both test selectors executes three cases, covers `price`, and leaves `refund` unreached. Running only `test_regular` reaches two of the three executable lines in `price`. Current explorer screenshots are `artifacts/coverage-explorer-by-test.png`, `artifacts/coverage-explorer-by-function.png`, and `artifacts/coverage-explorer-gap.png`. Earlier UI screenshots and an example context report are also in `artifacts/`.


## Function traces

In **Tests & coverage → Function traces**, select changed tests and click **Run selected tests with tracing**. This is a separate run from coverage: `uv run pytest <node IDs> -p princess_trace -p no:pytest_cov -o addopts=`. Only uv and pytest are required. The bundled plugin is supplied outside the temporary head snapshot. Default pytest extra arguments (`addopts` / `PYTEST_ADDOPTS`) are cleared for this mode so project defaults do not enable coverage or parallel subprocess workers. Collection/configuration otherwise uses the reviewed project.

Choose a recorded test case to open a pan-and-zoom call canvas inspired by the call-path bubbles in *Debugger Canvas* (DeLine et al., ICSE 2012). Each Python function activation gets a numbered source block, including unchanged repository functions, repeated calls, and recursive calls. Solid arrows connect callers to callees; call-site lines appear in the blocks. Generator/coroutine resumptions get new blocks with dashed continuation arrows. Use **Reveal calls** to expose the execution sequence, the call-order strip to focus a block, and **Fit canvas** / zoom controls to navigate. Selecting a block provides its full head source. Changed functions are labeled added/modified.

Capture covers Git-tracked repository Python files during test **call** phases. It omits module and class-body frames, fixture setup/teardown, built-in/C calls and external libraries. Calls in newly started threads during a test body are recorded as separate roots when there is no observed Python caller; existing worker threads and subprocesses are not instrumented. This is a recorded function-flow view, not an interactive debugger or a branch/line execution trace. Calls through excluded library code connect to the nearest recorded repository ancestor. Function activations do not imply every line in the displayed source ran.

Call records contain function identities, source locations, parent IDs, call/return ordering, thread numbers, and resume links. They do not contain arguments, locals, return values, or exception values. The optional run-output section is ordinary pytest output and can include pytest assertion diagnostics/prints. Failed tests retain their traces and outcomes. Runs share the existing same-origin/API-selector validation and timeout behavior, and coverage/trace runs cannot overlap. Traces are bounded at 2,000 activations per test case and 10,000 per run; truncation is explicit. The canvas initially displays up to 200 blocks, with **Show next 200** for larger traces. **Download trace JSON** saves revision IDs and the report; server results last until the next trace run or shutdown.

### Reproduce the trace demo

```sh
python examples/trace-demo/create.py /tmp/princess-trace-demo
bun run build
bun run review --repo /tmp/princess-trace-demo --base HEAD~ --head HEAD --port 3002
```

Select `test_order` and `test_bulk` for a passing demonstration. `test_order` produces eight activations, including two calls each to `line_total`, `unit_price`, and `discount`. The two parametrized bulk cases produce six activations each, including the bulk-discount helper. `test_paths` loops through three orders and takes two different downstream paths, demonstrating call-stack deduplication. `test_failure` demonstrates retaining a failing test's call path. Screenshots are `artifacts/function-trace-canvas.png` and `artifacts/function-trace-call.png`; `artifacts/function-trace-report.json` contains an example report.


### Deduplicating repeated call stacks

**Deduplicate call stacks** is an optional canvas mode. Activations with the same complete observed function stack, caller locations, and thread identity share one block. Counts and invocation IDs remain available, and turning the option off restores one block per activation. Recursion at different depths, different call sites, and different threads stay separate.

If repeated invocations take different downstream function-call paths, arrows retain separate colors and path labels through shared blocks. The comparison includes the ordered sequence and repetition of descendant calls. Identical downstream paths share a color/count; a difference deeper in the tree remains visible even when the intermediate blocks are collapsed. The path legend identifies the corresponding root invocation IDs. Click a path to isolate it, or **Show all paths** to restore the complete canvas. The full-source panel lets you select an individual invocation behind a collapsed block. Colors describe invocation paths within the selected test case, rather than combining separate test cases.

Path identities are computed from the entire captured case, so progressive reveal and display limits do not reassign colors. In deduplicated mode the initial display limit applies to distinct call stacks, allowing a long loop to retain all captured repetition counts without expanding every iteration. Function-flow traces cannot distinguish branches that execute the same function-call sequence. Capture truncation still applies.

In the trace demo, run only `test_paths`: twelve activations collapse to six blocks. Two normal iterations share one path; the bulk iteration takes the other path and reaches `apply_bulk`. Screenshots are `artifacts/function-trace-deduplicated.png` and `artifacts/function-trace-path-filter.png`.

The Pierre navigation experiment was browser-checked with a synthetic 2,000-file review, including filtering and selecting a distant file. Screenshots are in `artifacts/pierre-navigation.png` and `artifacts/pierre-navigation-large-diff.png`.
