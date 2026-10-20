// CalVer tags use vYYYY.MM.DD, with optional .N for another release that day.
export function releaseNotes(changelog: string, tag: string): string {
  const version = tag.replace(/^v/, "");
  if (!/^\d{4}\.\d{2}\.\d{2}(?:\.[1-9]\d*)?(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = line.match(/^## \[([^\]]+)\](?:\s|$)/);
    return heading?.[1] === version;
  });
  if (start === -1) throw new Error(`No changelog.md section for ${version}`);
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end]!)) end++;
  const notes = lines.slice(start + 1, end).join("\n").trim();
  if (!notes) throw new Error(`Empty changelog.md section for ${version}`);
  return notes + "\n";
}

if (import.meta.main) {
  const tag = Bun.argv[2];
  if (!tag) throw new Error("Usage: bun scripts/release-notes.ts vYYYY.MM.DD[.N]");
  console.write(releaseNotes(await Bun.file("changelog.md").text(), tag));
}
