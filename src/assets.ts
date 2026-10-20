import { resolve } from "node:path";

// The binary build replaces this module with imports of embedded files.
export const embedded = false;
export const browserFiles = new Map(
  [...new Bun.Glob("dist/**/*").scanSync({ cwd: resolve(import.meta.dir, ".."), onlyFiles: true })]
    .map((path) => [path.replaceAll("\\", "/").slice(4), resolve(import.meta.dir, "..", path)]),
);
export const parserWasm = resolve(import.meta.dir, "../node_modules/web-tree-sitter/tree-sitter.wasm");
export const pythonWasm = resolve(import.meta.dir, "../vendor/explorer/parsers/tree-sitter-python.wasm");
const platform = `${process.platform}-${process.arch}${process.platform === "linux" ? "-gnu" : process.platform === "win32" ? "-msvc" : ""}`;
export const astGrep = require.resolve(`@ast-grep/cli-${platform}/${process.platform === "win32" ? "ast-grep.exe" : "ast-grep"}`);
