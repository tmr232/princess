# Changelog

Release notes are maintained here. Before pushing a `vX.Y.Z` tag, move the
relevant changes from **Unreleased** into a `## [X.Y.Z] - YYYY-MM-DD` section.
The release workflow uses only the section matching the tag, not Unreleased.

## [Unreleased]

### Added

- Standalone Bun executables for Linux (glibc), macOS, and Windows on x64 and ARM64.
- CI builds and standalone smoke tests for each supported platform.
- Tagged GitHub Releases with binary archives and notes from this changelog.
- Configurable base pytest command and snapshot-relative working directory for both coverage and callgraphs.
