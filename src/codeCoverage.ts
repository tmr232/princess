import type { CoverageReport } from "./coverage";
export type FileCoverage = CoverageReport["files"][string];
export type LineCoverage = { status: "covered" | "uncovered" | "outside"; tests: string[] };

export function lineCoverage(data: FileCoverage, line: number, test = ""): LineCoverage | null {
  if (!data.executed_lines.includes(line) && !data.missing_lines.includes(line)) return null;
  const tests = [...new Set((data.contexts?.[String(line)] ?? [])
    .filter(context => context.endsWith("|run"))
    .map(context => context.slice(0, -4)))].sort();
  if (!tests.length && !data.missing_lines.includes(line)) return { status: "outside", tests };
  if (test) return { status: tests.includes(test) ? "covered" : "uncovered", tests };
  return { status: tests.length ? "covered" : data.missing_lines.includes(line) ? "uncovered" : "outside", tests };
}

export function originalLine(index: number, start: number, projection?: (number | null)[]) {
  return projection ? projection[index - 1] ?? null : index + start - 1;
}
