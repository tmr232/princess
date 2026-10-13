import { Parser, Language, type Node } from "web-tree-sitter";
import { Graphviz } from "@hpcc-js/wasm-graphviz";
import core from "../vendor/explorer/parsers/tree-sitter.wasm?url";
import python from "../vendor/explorer/parsers/tree-sitter-python.wasm?url";
import { pythonLanguageDefinition } from "../vendor/explorer/src/control-flow/cfg-python";
import { graphToDot } from "../vendor/explorer/src/control-flow/render";
import {
  simplifyCFG,
  trimFor,
} from "../vendor/explorer/src/control-flow/graph-ops";
import {
  mergeNodeAttrs,
  remapNodeTargets,
} from "../vendor/explorer/src/control-flow/cfg-defs";
import type { SymbolInfo } from "./model";

const ready = (async () => {
  await Parser.init({ locateFile: () => core });
  const parser = new Parser();
  parser.setLanguage(await Language.load(python));
  return { parser, graphviz: await Graphviz.load() };
})();
export async function graph(
  source: string,
  symbol: SymbolInfo,
  namespace: string,
) {
  const { parser, graphviz } = await ready;
  const tree = parser.parse(source)!;
  try {
    const visit = (n: Node): Node | null => {
      if (
        n.type === "function_definition" &&
        n.startPosition.row + 1 === symbol.line
      )
        return n;
      for (const c of n.namedChildren) {
        if (!c) continue;
        const found = visit(c);
        if (found) return found;
      }
      return null;
    };
    const node = visit(tree.rootNode);
    if (!node) throw new Error("Function not found");
    let cfg = pythonLanguageDefinition.createCFGBuilder({}).buildCFG(node);
    cfg = remapNodeTargets(simplifyCFG(trimFor(cfg), mergeNodeAttrs));
    const svg = graphviz.dot(graphToDot(cfg, false));
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    doc.querySelectorAll("[id]").forEach((el) => {
      el.id = `${namespace}-${el.id}`;
    });
    doc.documentElement.removeAttribute("width");
    doc.documentElement.removeAttribute("height");
    return new XMLSerializer().serializeToString(doc.documentElement);
  } finally {
    tree.delete();
  }
}
