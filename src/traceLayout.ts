import type { TraceCall, TraceFunction } from "./trace";
export type TraceBlock = { call: TraceCall; calls: TraceCall[]; fn: TraceFunction; x: number; y: number; height: number; preview: string[] };
export type TraceVariant = { id: string; groupId: number; name: string; index: number; callIds: number[]; color: string; dash?: string };
export type TraceEdge = { from: TraceBlock; to: TraceBlock; resume: boolean; variant?: TraceVariant; calls: TraceCall[] };
const palette = ["#2563eb", "#c2410c", "#15803d", "#9333ea", "#be185d", "#0e7490", "#a16207", "#475569"];

// Group by the entire observed stack, including caller lines and thread identity.
// Subtree signatures preserve ordered calls and repetition, independently of layout/reveal limits.
export function tracePatterns(calls: TraceCall[]) {
  const ordered = [...calls].sort((a, b) => a.id - b.id);
  const byId = new Map(ordered.map(call => [call.id, call]));
  const groupByCall = new Map<number, number>();
  const groups = new Map<number, TraceCall[]>();
  const parents = new Map<number, number | null>();
  const keys = new Map<string, number>();
  const children = new Map<number, TraceCall[]>();
  for (const call of ordered) {
    const parent = groupByCall.get(call.parentId ?? -1) ?? null;
    const key = JSON.stringify([call.thread, parent, call.functionId, call.callLine]);
    const group = keys.get(key) ?? call.id;
    keys.set(key, group); groupByCall.set(call.id, group); parents.set(group, parent);
    const members = groups.get(group) ?? []; members.push(call); groups.set(group, members);
    if (call.parentId !== null && byId.has(call.parentId)) {
      const nested = children.get(call.parentId) ?? []; nested.push(call); children.set(call.parentId, nested);
    }
  }
  // Intern signatures so deep/repeated trees do not expand into quadratic JSON strings.
  const signatures = new Map<number, number>(), interned = new Map<string, number>();
  for (const call of [...ordered].reverse()) {
    const key = JSON.stringify([call.functionId, call.kind, call.suspended ?? false,
      (children.get(call.id) ?? []).map(child => [child.callLine, signatures.get(child.id)])]);
    const signature = interned.get(key) ?? interned.size + 1;
    interned.set(key, signature); signatures.set(call.id, signature);
  }
  const divergent = new Set([...groups].filter(([, members]) => new Set(members.map(call => signatures.get(call.id))).size > 1).map(([id]) => id));
  // A topmost divergent stack supplies path identity throughout its subtree.
  const roots = new Set([...divergent].filter(group => {
    let parent = parents.get(group);
    while (parent !== undefined && parent !== null) {
      if (divergent.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  }));
  const variants: TraceVariant[] = [];
  const variantByRootCall = new Map<number, TraceVariant>();
  for (const group of roots) {
    const bySignature = new Map<number, TraceCall[]>();
    for (const call of groups.get(group)!) {
      const signature = signatures.get(call.id)!;
      const members = bySignature.get(signature) ?? []; members.push(call); bySignature.set(signature, members);
    }
    let index = 1;
    for (const members of bySignature.values()) {
      const ordinal = variants.length;
      const variant: TraceVariant = { id: `${group}:${index}`, groupId: group, name: members[0]!.functionId, index: ordinal + 1,
        callIds: members.map(call => call.id), color: palette[ordinal % palette.length]!,
        ...(ordinal >= palette.length ? { dash: `${4 + Math.floor(ordinal / palette.length) * 2} 3` } : {}) };
      variants.push(variant); for (const call of members) variantByRootCall.set(call.id, variant); index++;
    }
  }
  const variantByCall = new Map<number, TraceVariant>();
  for (const call of ordered) {
    const variant = variantByRootCall.get(call.id) ?? variantByCall.get(call.parentId ?? -1);
    if (variant) variantByCall.set(call.id, variant);
  }
  return { groupByCall, groups, variants, variantByCall, byId };
}

export function traceLayout(calls: TraceCall[], functions: TraceFunction[], options: { deduplicate?: boolean; contextCalls?: TraceCall[]; maxBlocks?: number } = {}) {
  const patterns = tracePatterns(options.contextCalls ?? calls);
  const byFunction = new Map(functions.map(fn => [fn.id, fn]));
  const blocks: TraceBlock[] = [];
  const allGroups = new Set<number>();
  const byGroup = new Map<number, TraceBlock>(), byId = new Map<number, TraceBlock>();
  for (const call of calls) {
    const fn = byFunction.get(call.functionId);
    if (!fn) continue;
    const group = options.deduplicate ? patterns.groupByCall.get(call.id)! : call.id;
    allGroups.add(group);
    let block = byGroup.get(group);
    if (!block && blocks.length >= (options.maxBlocks ?? Infinity)) continue;
    if (!block) {
      const preview = fn.source.split("\n").slice(0, 10);
      block = { call, calls: [], fn, x: 0, y: 0, height: 100 + preview.length * 17, preview };
      byGroup.set(group, block); blocks.push(block);
    }
    block.calls.push(call); byId.set(call.id, block);
  }
  const children = new Map<number | null, TraceBlock[]>();
  for (const block of blocks) {
    const parent = byId.get(block.call.parentId ?? -1)?.call.id ?? null;
    const group = children.get(parent) ?? []; group.push(block); children.set(parent, group);
  }
  const sizes = new Map<number, number>();
  function measure(block: TraceBlock): number {
    const nested = children.get(block.call.id) ?? [];
    const height = Math.max(block.height, nested.reduce((sum, child) => sum + measure(child) + 30, -30));
    sizes.set(block.call.id, height); return height;
  }
  let top = 30, width = 400;
  function place(block: TraceBlock, depth: number, top: number) {
    block.x = 30 + depth * 420;
    block.y = top + (sizes.get(block.call.id)! - block.height) / 2;
    width = Math.max(width, block.x + 400);
    let next = top;
    for (const child of children.get(block.call.id) ?? []) {
      place(child, depth + 1, next); next += sizes.get(child.call.id)! + 30;
    }
  }
  for (const block of children.get(null) ?? []) { measure(block); place(block, 0, top); top += sizes.get(block.call.id)! + 45; }
  const edges: TraceEdge[] = [], groupedEdges = new Map<string, TraceEdge>();
  for (const call of calls) {
    const to = byId.get(call.id);
    if (!to) continue;
    for (const [origin, resume] of [[call.parentId, false], [call.resumeFrom, true]] as const) {
      const from = byId.get(origin ?? -1);
      if (!from) continue;
      const variant = options.deduplicate ? patterns.variantByCall.get(call.id) : undefined;
      const key = JSON.stringify([from.call.id, to.call.id, resume, variant?.id]);
      let edge = groupedEdges.get(key);
      if (!edge) { edge = { from, to, resume, variant, calls: [] }; groupedEdges.set(key, edge); edges.push(edge); }
      edge.calls.push(call);
    }
  }
  return { blocks, edges, width: width + (edges.some(edge => edge.from === edge.to) ? 90 : 30), height: Math.max(top, 300), patterns, totalBlocks: allGroups.size };
}

export function traceVariantCalls(patterns: ReturnType<typeof tracePatterns>, variantId: string) {
  const allowed = new Set<number>();
  for (const [id, variant] of patterns.variantByCall) if (variant.id === variantId) {
    let call = patterns.byId.get(id);
    while (call && !allowed.has(call.id)) { allowed.add(call.id); call = patterns.byId.get(call.parentId ?? -1); }
  }
  return allowed;
}
