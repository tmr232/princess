import { testTargets } from "./testTargets";
import type { Review, SymbolInfo } from "./model";
import type { CoverageState, TestTarget } from "./coverage";

export type CoverageFunctionNode = {
  fileId: string; changeId: string; name: string; path: string;
  symbol: SymbolInfo; status: "added" | "modified"; tests: string[];
};
export type CoverageTestNode = {
  nodeid: string; target: TestTarget; functions: CoverageFunctionNode[];
};

export function coverageNavigation(review: Review, state: CoverageState | null) {
  const targets = state?.targets ?? testTargets(review);
  const functions: CoverageFunctionNode[] = review.files.flatMap(file => file.changes.flatMap(change => {
    if (change.kind !== "function" || !change.after || change.status === "removed" ||
        targets.some(t => t.fileId === file.id && t.changeId === change.id)) return [];
    const measured = state?.status === "complete" ? state.functions.find(fn => fn.fileId === file.id && fn.changeId === change.id) : undefined;
    return [{ fileId: file.id, changeId: change.id, name: change.after.id, path: file.path,
      symbol: change.after, status: change.status, tests: measured?.tests ?? [] }];
  }));
  const contexts = state?.status === "complete" ? [
    ...state.functions.flatMap(fn => fn.tests),
    ...Object.values(state.report?.files ?? {}).flatMap(file => Object.values(file.contexts ?? {}).flat()
      .filter(context => context.endsWith("|run")).map(context => context.slice(0, -4))),
  ] : [];
  const tests: CoverageTestNode[] = targets.flatMap(target => {
    const cases = [...new Set(contexts.filter(id => id === target.nodeid || id.startsWith(`${target.nodeid}[`)))].sort();
    return (cases.length ? cases : [target.nodeid]).map(nodeid => ({
      nodeid, target, functions: functions.filter(fn => fn.tests.includes(nodeid)),
    }));
  });
  // Keep both directions restricted to changed tests in this review.
  for (const fn of functions) fn.tests = fn.tests.filter(id => tests.some(test => test.nodeid === id));
  return { functions, tests };
}
