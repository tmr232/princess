import { expect, test } from "bun:test";
import { releaseNotes } from "./release-notes";

test("extracts only the tagged release, preserving Markdown subsections", () => {
  const changelog = `# Changelog

## [Unreleased]
Future changes.

## [1.2.0-rc.1] - 2026-10-20
### Added
- Standalone binaries.

### Fixed
- Parser embedding.

## [1.1.0] - 2026-10-19
Older changes.
`;
  expect(releaseNotes(changelog.replaceAll("\n", "\r\n"), "v1.2.0-rc.1")).toBe(
    "### Added\n- Standalone binaries.\n\n### Fixed\n- Parser embedding.\n",
  );
  expect(() => releaseNotes(changelog, "v1.2.0")).toThrow("No changelog.md section");
  expect(() => releaseNotes("## [1.2.0]\n\n## [1.1.0]\nOld", "v1.2.0")).toThrow("Empty changelog.md section");
});
