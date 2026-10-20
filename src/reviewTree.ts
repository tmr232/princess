import type { Change, Review } from "./model";
import type { GitStatusEntry } from "@pierre/trees";
export type ReviewTreeRow = { fileId: string; filePath: string; change: Change | null; title: string };
export function reviewTree(review: Review) {
  const paths: string[] = [], rows = new Map<string, ReviewTreeRow>(), statuses: GitStatusEntry[] = [];
  for (const file of review.files) {
    const module: Change = { id: "$module", name: file.path, kind: "module", parent: null,
      status: file.status === "A" ? "added" : file.status === "D" ? "removed" : "modified", before: null, after: null };
    rows.set(file.path, { fileId: file.id, filePath: file.path, change: file.supported ? module : null,
      title: `${file.path}${file.oldPath !== file.path ? ` · renamed from ${file.oldPath}` : ""}${!file.supported ? " · Non-Python file · file change only" : !file.changes.length ? " · No definition changes" : ""}` });
    paths.push(file.path + (file.changes.length ? "/" : ""));
    statuses.push({ path: file.path, status: file.status.startsWith("R") ? "renamed" : module.status === "removed" ? "deleted" : module.status });
    const bySymbol = new Map(file.changes.filter(change => change.kind !== "module").map(change => [(change.after ?? change.before)!.id, change]));
    const resolved = new Map<string, string>();
    function symbolPath(change: Change): string {
      if (resolved.has(change.id)) return resolved.get(change.id)!;
      const parent = change.parent ? bySymbol.get(change.parent) : undefined;
      const base = parent ? symbolPath(parent) : file.path;
      const id = (change.after ?? change.before)?.id ?? change.id;
      const ordinal = id.match(/#\d+$/)?.[0] ?? "";
      const name = `${change.kind === "class" ? "C" : change.kind === "function" ? "ƒ" : "·"} ${change.kind === "module" ? "Module-level changes" : change.name + ordinal}`;
      const path = `${base}/${name}`;
      resolved.set(change.id, path); return path;
    }
    for (const change of file.changes) {
      const path = symbolPath(change);
      paths.push(path);
      rows.set(path, { fileId: file.id, filePath: file.path, change, title: `${file.path} · ${(change.after ?? change.before)?.id ?? "Module-level changes"} · ${change.status}` });
      statuses.push({ path, status: change.status === "removed" ? "deleted" : change.status });
    }
  }
  return { paths, rows, statuses };
}
