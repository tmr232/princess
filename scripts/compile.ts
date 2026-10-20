import { resolve } from "node:path";
import { browserFiles as assets, parserWasm, pythonWasm, astGrep, tracePlugin } from "../src/assets";

// Build on the target OS/architecture so ast-grep matches the Bun executable.
const root = resolve(import.meta.dir, "..");
if (!assets.has("/index.html")) throw new Error("Run bun run build first");
const files = [
  parserWasm,
  pythonWasm,
  astGrep,
  tracePlugin,
  ...assets.values(),
];
const result = await Bun.build({
  entrypoints: [resolve(root, "src/cli.ts")],
  compile: { outfile: resolve(root, "build", process.platform === "win32" ? "princess.exe" : "princess") },
  plugins: [{
    name: "embed-assets",
    setup(build) {
      build.onLoad({ filter: /[/\\]src[/\\]assets\.ts$/ }, () => ({
        loader: "ts",
        contents: files.map((path, i) => `import file${i} from ${JSON.stringify(path)} with { type: "file" };`).join("\n") + `
          export const embedded = true;
          export const parserWasm = file0;
          export const pythonWasm = file1;
          export const astGrep = file2;
          export const tracePlugin = file3;
          export const browserFiles = new Map([${[...assets.keys()].map((key, i) => `[${JSON.stringify(key)}, file${i + 4}]`).join(",")}]);
        `,
      }));
    },
  }],
});
if (!result.success) throw new AggregateError(result.logs, "Compilation failed");
