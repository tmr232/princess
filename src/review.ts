import { resolve } from "node:path";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Parser, Language, type Node } from "web-tree-sitter";
import { z } from "zod";
import type { Review, SymbolInfo, Change } from "./model";
import { projectInterface, type InterfaceOptions } from "./interface";
import { embedded, astGrep, parserWasm, pythonWasm } from "./assets";

let executablePromise: Promise<string> | undefined;
function executable() {
  return (executablePromise ??= (async () => {
    if (!embedded) return astGrep;
    // Embedded files are virtual; subprocesses need a real executable on disk.
    const directory = mkdtempSync(resolve(tmpdir(), "princess-"));
    process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
    const path = resolve(directory, process.platform === "win32" ? "ast-grep.exe" : "ast-grep");
    await Bun.write(path, Bun.file(astGrep));
    chmodSync(path, 0o700);
    return path;
  })());
}

async function run(args: string[], cwd: string, stdin?: string) {
  const proc = Bun.spawn(args, {
    cwd,
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${args[0]} failed: ${err.trim()}`);
  return out;
}
let parserPromise: Promise<Parser> | undefined;
function parser() {
  return (parserPromise ??= (async () => {
    await Parser.init({ wasmBinary: await Bun.file(parserWasm).arrayBuffer() });
    const p = new Parser();
    p.setLanguage(await Language.load(new Uint8Array(await Bun.file(pythonWasm).arrayBuffer())));
    return p;
  })());
}
const entrySchema = z.object({
  name: z.string(),
  range: z.object({ start: z.object({ line: z.number() }) }),
});
const outlineSchema = z.array(
  z.object({
    items: z.array(
      entrySchema.extend({ members: z.array(entrySchema).optional() }),
    ),
  }),
);

async function analyze(source: string): Promise<SymbolInfo[]> {
  // Run outside the reviewed repo: its config must not affect analysis or load tools.
  const output = await run(
    [
      await executable(),
      "outline",
      "--stdin",
      "--lang",
      "python",
      "--items",
      "structure",
      "--type",
      "class,function",
      "--view",
      "expanded",
      "--json=compact",
    ],
    tmpdir(),
    source,
  );
  const outline = outlineSchema.parse(JSON.parse(output));
  const entries = outline.flatMap((f) =>
    f.items.flatMap((item) => [item, ...(item.members ?? [])]),
  );
  const tree = (await parser()).parse(source);
  if (!tree || tree.rootNode.hasError) {
    tree?.delete();
    throw new Error("Cannot analyze invalid Python syntax");
  }
  const symbols: SymbolInfo[] = [];
  function visit(node: Node, parent: string | null) {
    let owner = parent;
    if (
      node.type === "function_definition" ||
      node.type === "class_definition"
    ) {
      const name =
        entries.find(
          (entry) => entry.range.start.line === node.startPosition.row,
        )?.name ?? node.childForFieldName("name")!.text;
      const base = parent ? `${parent}.${name}` : name;
      // Repeated definitions remain separate; ordinal pairing is intentionally conservative.
      const ordinal = symbols.filter(
        (s) => s.name === name && s.parent === parent,
      ).length;
      owner = ordinal ? `${base}#${ordinal + 1}` : base;
      const range =
        node.parent?.type === "decorated_definition" ? node.parent : node;
      symbols.push({
        id: owner,
        name,
        kind: node.type === "class_definition" ? "class" : "function",
        parent,
        start: range.startIndex,
        end: range.endIndex,
        line: node.startPosition.row + 1,
        signature: source.slice(
          node.startIndex,
          node.children.find((child) => child?.type === ":")!.endIndex,
        ),
      });
    }
    for (const child of node.namedChildren) if (child) visit(child, owner);
  }
  visit(tree.rootNode, null);
  // Outline supplies names; Tree-sitter fills nested definitions and decorator ranges.
  tree.delete();
  return symbols;
}

export async function createInterface(
  source: string,
  options: InterfaceOptions,
  classLine?: number,
  lineNumbers?: (number | null)[],
) {
  const tree = (await parser()).parse(source);
  if (!tree || tree.rootNode.hasError) {
    tree?.delete();
    throw new Error("Cannot analyze invalid Python syntax");
  }
  try {
    function findClass(node: Node): Node | null {
      if (
        node.type === "class_definition" &&
        node.startPosition.row + 1 === classLine
      )
        return node.parent?.type === "decorated_definition"
          ? node.parent
          : node;
      for (const child of node.namedChildren) {
        if (!child) continue;
        const found = findClass(child);
        if (found) return found;
      }
      return null;
    }
    const root =
      classLine === undefined ? tree.rootNode : findClass(tree.rootNode);
    if (!root) throw new Error("Class not found in revision source");
    return projectInterface(root, options, lineNumbers);
  } finally {
    tree.delete();
  }
}

export async function createReview(
  repoPath: string,
  baseRef: string,
  headRef: string,
) {
  const repo = resolve(repoPath);
  const git = (...args: string[]) =>
    run(["git", "--no-pager", "-c", "core.quotePath=false", ...args], repo);
  const base = (
    await git(
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${baseRef}^{commit}`,
    )
  ).trim();
  const head = (
    await git(
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${headRef}^{commit}`,
    )
  ).trim();
  const entries = (
    await git(
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--name-status",
      "-z",
      "--find-renames",
      base,
      head,
      "--",
    )
  ).split("\0");
  const review: Review = { repo, base, head, files: [] };
  const sources = new Map<
    string,
    { before: string | null; after: string | null }
  >();
  for (let i = 0; i < entries.length && entries[i];) {
    const status = entries[i++]!;
    const oldPath = entries[i++]!;
    const path =
      status.startsWith("R") || status.startsWith("C")
        ? entries[i++]!
        : oldPath;
    const id = String(review.files.length);
    const supported = path.endsWith(".py") && oldPath.endsWith(".py");
    const file = {
      id,
      path,
      oldPath,
      status,
      supported,
      changes: [] as Change[],
    };
    review.files.push(file);
    if (!supported) continue;
    const before =
      status === "A" ? null : await git("show", `${base}:${oldPath}`);
    const after = status === "D" ? null : await git("show", `${head}:${path}`);
    sources.set(id, { before, after });
    const left = before === null ? [] : await analyze(before);
    const right = after === null ? [] : await analyze(after);
    for (const key of new Set(
      [...left, ...right].map((s) => `${s.kind}:${s.id}`),
    )) {
      const a = left.find((s) => `${s.kind}:${s.id}` === key) ?? null;
      const b = right.find((s) => `${s.kind}:${s.id}` === key) ?? null;
      if (
        a &&
        b &&
        before!.slice(a.start, a.end) === after!.slice(b.start, b.end)
      )
        continue;
      const s = b ?? a!;
      file.changes.push({
        id: key,
        name: s.name,
        kind: s.kind,
        parent: s.parent,
        status: !a ? "added" : !b ? "removed" : "modified",
        before: a,
        after: b,
      });
    }
    // Keep new and removed methods under their class, rather than appending them at file level.
    const ordered: Change[] = [];
    function collect(parent: string | null) {
      for (const change of file.changes.filter((c) => c.parent === parent)) {
        if (ordered.includes(change)) continue;
        ordered.push(change);
        collect((change.after ?? change.before)!.id);
      }
    }
    collect(null);
    file.changes = ordered;
    function outside(source: string | null, symbols: SymbolInfo[]) {
      if (source === null) return "";
      let cursor = 0,
        result = "";
      for (const s of symbols.filter((s) => !s.parent)) {
        result += source.slice(cursor, s.start);
        cursor = s.end;
      }
      return (result + source.slice(cursor)).trim();
    }
    if (outside(before, left) !== outside(after, right))
      file.changes.push({
        id: "$module",
        name: "Module-level changes",
        kind: "module",
        parent: null,
        status: "modified",
        before: null,
        after: null,
      });
  }
  return { review, sources };
}
