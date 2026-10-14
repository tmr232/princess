import type { Review } from "./model";
import type { TestTarget } from "./coverage";

export function testTargets(review: Review): TestTarget[] {
  return review.files.flatMap(file => {
    if (!/^test_.*\.py$|^.*_test\.py$/.test(file.path.split("/").at(-1)!)) return [];
    return file.changes.flatMap(change => {
      const symbol = change.after;
      if (!symbol || change.kind !== "function" || !change.name.startsWith("test")) return [];
      const owners = symbol.parent?.split(".") ?? [];
      if (owners.some(owner => !owner.startsWith("Test") || owner.includes("#"))) return [];
      if (symbol.id.includes("#")) return [];
      return [{ nodeid: [file.path, ...owners, change.name].join("::"), fileId: file.id, changeId: change.id }];
    });
  });
}

