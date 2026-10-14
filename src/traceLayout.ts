import type { TraceCall, TraceFunction } from "./trace";
export type TraceBlock = { call: TraceCall; fn: TraceFunction; x: number; y: number; height: number; preview: string[] };
export function traceLayout(calls: TraceCall[], functions: TraceFunction[]) {
  const byFunction = new Map(functions.map(fn => [fn.id, fn]));
  const blocks: TraceBlock[] = calls.flatMap(call => {
    const fn = byFunction.get(call.functionId);
    if (!fn) return [];
    const preview = fn.source.split("\n").slice(0, 10);
    return [{ call, fn, x: 0, y: 0, height: 100 + preview.length * 17, preview }];
  });
  const byId = new Map(blocks.map(block => [block.call.id, block]));
  const children = new Map<number | null, TraceBlock[]>();
  for (const block of blocks) {
    const parent = byId.has(block.call.parentId ?? -1) ? block.call.parentId : null;
    const group = children.get(parent) ?? [];
    group.push(block); children.set(parent, group);
  }
  const sizes = new Map<number, number>();
  function measure(block: TraceBlock): number {
    // Parent IDs always precede child IDs in recorded traces.
    const nested = (children.get(block.call.id) ?? []).filter(child => child.call.id > block.call.id);
    const height = Math.max(block.height, nested.reduce((sum, child) => sum + measure(child) + 30, -30));
    sizes.set(block.call.id, height); return height;
  }
  let top = 30, width = 400;
  function place(block: TraceBlock, depth: number, top: number) {
    block.x = 30 + depth * 420;
    block.y = top + (sizes.get(block.call.id)! - block.height) / 2;
    width = Math.max(width, block.x + 400);
    let next = top;
    for (const child of (children.get(block.call.id) ?? []).filter(child => child.call.id > block.call.id)) {
      place(child, depth + 1, next); next += sizes.get(child.call.id)! + 30;
    }
  }
  for (const block of children.get(null) ?? []) { measure(block); place(block, 0, top); top += sizes.get(block.call.id)! + 45; }
  const edges = blocks.flatMap(block => {
    const parent = byId.get(block.call.parentId ?? -1);
    const previous = byId.get(block.call.resumeFrom ?? -1);
    return [parent ? { from: parent, to: block, resume: false } : null, previous ? { from: previous, to: block, resume: true } : null].filter(edge => edge !== null);
  });
  return { blocks, edges, width: width + 30, height: Math.max(top, 300) };
}
