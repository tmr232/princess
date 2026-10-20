import { expect, test } from "bun:test";
import { releaseNotes } from "./release-notes";

test("extracts only the tagged release, preserving Markdown subsections", () => {
  const changelog = `# Changelog

## [Unreleased]
Future changes.

## [2026.10.20-rc.1] - 2026-10-20
### Added
- Standalone binaries.

### Fixed
- Parser embedding.

## [2026.10.19] - 2026-10-19
Older changes.
`;
  expect(releaseNotes(changelog.replaceAll("\n", "\r\n"), "v2026.10.20-rc.1")).toBe(
    "### Added\n- Standalone binaries.\n\n### Fixed\n- Parser embedding.\n",
  );
  expect(() => releaseNotes(changelog, "v2026.10.20")).toThrow("No changelog.md section");
  expect(() => releaseNotes("## [2026.10.20]\n\n## [2026.10.19]\nOld", "v2026.10.20")).toThrow("Empty changelog.md section");
  expect(releaseNotes("## [2026.10.20.1]\nSecond release.\n\n## [2026.10.20]\nFirst release.", "v2026.10.20.1")).toBe("Second release.\n");
  expect(() => releaseNotes(changelog, "v1.2.0")).toThrow("Invalid release tag");
});
