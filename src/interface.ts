import type { Node } from "web-tree-sitter";

export interface InterfaceOptions {
  showPrivate: boolean;
  showDocstrings: boolean;
}

/** A static review projection, not an inferred or executable type stub. */
export function projectInterface(
  root: Node,
  options: InterfaceOptions,
): string {
  const visible = (name: string) =>
    options.showPrivate || !name.startsWith("_") || /^__.*__$/.test(name);
  const indent = (depth: number) => "    ".repeat(depth);
  function text(node: Node, depth: number, value = node.text) {
    const originalIndent = new RegExp(
      `^[ \\t]{0,${node.startPosition.column}}`,
    );
    return value
      .split(/\r?\n/)
      .map(
        (line, i) =>
          indent(depth) + (i ? line.replace(originalIndent, "") : line),
      )
      .join("\n");
  }
  function header(node: Node, depth: number) {
    const colon = node.children.find((child) => child?.type === ":")!;
    return text(
      node,
      depth,
      node.text.slice(0, colon.endIndex - node.startIndex),
    );
  }
  function isDocstring(node: Node) {
    const value =
      node.type === "expression_statement" ? node.namedChild(0) : null;
    if (!value || !["string", "concatenated_string"].includes(value.type))
      return false;
    const strings = value.type === "string" ? [value] : value.namedChildren;
    return strings.every((s) => s && /^[rRuU]*["']/.test(s.text));
  }
  function body(node: Node, depth: number, hasDocstring = true) {
    const statements = node.namedChildren.filter(
      (n): n is Node => !!n && n.type !== "comment",
    );
    return statements.flatMap((statement, i) =>
      hasDocstring && i === 0 && isDocstring(statement)
        ? options.showDocstrings
          ? [text(statement, depth)]
          : []
        : render(statement, depth),
    );
  }
  function assignment(node: Node, depth: number): string[] {
    const left = node.childForFieldName("left")!;
    const right = node.childForFieldName("right");
    const annotation = node.childForFieldName("type");
    if (
      left.type === "identifier" &&
      annotation &&
      /^(typing\.)?TypeAlias$/.test(annotation.text)
    )
      return visible(left.text) ? [text(node, depth)] : [];
    const names =
      left.type === "identifier"
        ? [left]
        : ["pattern_list", "tuple_pattern", "list_pattern"].includes(left.type)
          ? left.namedChildren.filter(
              (n): n is Node => !!n && n.type === "identifier",
            )
          : [];
    return [
      ...names
        .filter((name) => visible(name.text))
        .map(
          (name) =>
            `${indent(depth)}${name.text}${annotation ? `: ${annotation.text}` : ""}${right ? " = ..." : ""}`,
        ),
      ...(right?.type === "assignment" ? assignment(right, depth) : []),
    ];
  }
  function render(node: Node, depth: number): string[] {
    if (node.type === "decorated_definition") {
      const definition = node.childForFieldName("definition")!;
      const result = render(definition, depth);
      return result.length
        ? [
            ...node.namedChildren
              .filter((n) => n?.type === "decorator")
              .map((n) => text(n!, depth)),
            ...result,
          ]
        : [];
    }
    if (["class_definition", "function_definition"].includes(node.type)) {
      if (!visible(node.childForFieldName("name")!.text)) return [];
      const block = node.childForFieldName("body")!;
      const first = block.namedChildren.find((n) => n?.type !== "comment");
      const contents =
        node.type === "class_definition"
          ? body(block, depth + 1)
          : options.showDocstrings && first && isDocstring(first)
            ? [text(first, depth + 1)]
            : [];
      return [
        header(node, depth),
        ...contents,
        ...(node.type === "function_definition" || !contents.length
          ? [`${indent(depth + 1)}...`]
          : []),
      ];
    }
    if (
      [
        "import_statement",
        "import_from_statement",
        "future_import_statement",
      ].includes(node.type)
    )
      return [text(node, depth)];
    if (node.type === "type_alias_statement")
      return visible(node.childForFieldName("left")!.text.split("[")[0]!.trim())
        ? [text(node, depth)]
        : [];
    if (
      node.type === "expression_statement" &&
      node.namedChild(0)?.type === "assignment"
    )
      return assignment(node.namedChild(0)!, depth);
    // Retain guards around static declarations, e.g. TYPE_CHECKING imports.
    if (
      [
        "if_statement",
        "try_statement",
        "elif_clause",
        "else_clause",
        "except_clause",
        "finally_clause",
      ].includes(node.type)
    ) {
      const block = node.namedChildren.find((n) => n?.type === "block")!;
      const contents = body(block, depth + 1, false);
      const alternatives = node.namedChildren
        .filter((n): n is Node => !!n && n.type.endsWith("_clause"))
        .map((node) => ({ node, lines: render(node, depth) }));
      return contents.length ||
        alternatives.some((clause) => clause.lines.length)
        ? [
            header(node, depth),
            ...(contents.length ? contents : [`${indent(depth + 1)}...`]),
            ...alternatives.flatMap(({ node, lines }) =>
              lines.length
                ? lines
                : [header(node, depth), `${indent(depth + 1)}...`],
            ),
          ]
        : [];
    }
    return [];
  }
  const lines = root.type === "module" ? body(root, 0) : render(root, 0);
  return lines.length ? lines.join("\n") + "\n" : "";
}
