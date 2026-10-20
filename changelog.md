# Changelog

Releases use CalVer: `vYYYY.MM.DD` (Jerusalem calendar date), with an optional
`.N` suffix for additional releases on the same day, such as `v2026.10.20.1`.
Before pushing a tag, move the relevant changes from **Unreleased** into a
matching `## [YYYY.MM.DD] - YYYY-MM-DD` section (including `.N` when used).
The release workflow uses only the section matching the tag, not Unreleased.

## [Unreleased]

## [2026.10.20] - 2026-10-20

First public release of Princess.

### Added

- Local review of Git commit snapshots, with default-branch merge-base comparison and a searchable structural navigation tree.
- Python function and class diffs, filtered interface views, and before/after control-flow graphs.
- On-demand pytest coverage with test-to-function associations and source-line highlighting.
- Recorded function callgraphs with repeated-call deduplication, execution-path navigation, and JSON export.
- Standalone Bun executables for Linux (glibc), macOS, and Windows on x64 and ARM64.
- CI builds and standalone smoke tests for each supported platform.
- Tagged GitHub Releases with binary archives and notes from this changelog.
- Configurable base pytest command and snapshot-relative working directory for both coverage and callgraphs.

### Fixed

- Preserve traced calls through path aliases and Windows path casing, and recognize generator suspensions on Python 3.13.
- Allow Git-heavy snapshot tests enough time to complete on Windows ARM64 runners.

### Requirements and limitations

- Git must be available on `PATH`. Static review does not require Bun, Node.js, or Python when using a standalone binary.
- Coverage and callgraphs execute reviewed Python code on demand. The default command requires uv and the project's pytest dependencies; coverage also requires pytest-cov.
- Binaries are unsigned. Linux builds require glibc. The server defaults to loopback and has no authentication.
