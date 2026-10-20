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
