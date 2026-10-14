import { expect, test } from "bun:test";
import { traceLayout, tracePatterns, traceVariantCalls } from "./traceLayout";
import type { TraceCall, TraceFunction } from "./trace";
const fn = (id: string): TraceFunction => ({ id, name: id, path: "flow.py", line: 1, endLine: 2, source: `def ${id}():\n    pass` });
const call = (id: number, functionId: string, parentId: number | null, callLine: number | null = parentId === null ? null : 10): TraceCall => ({ id, functionId, parentId, callLine, thread: 1, entryOrder: id, kind: "call", resumeFrom: null });

test("repeated stacks collapse while downstream paths preserve invocation identity through shared blocks", () => {
  const functions = ["test", "work", "shared", "branch_a", "branch_b"].map(fn);
  const calls = [call(1, "test", null), call(2, "work", 1), call(3, "shared", 2), call(4, "branch_a", 3),
    call(5, "work", 1), call(6, "shared", 5), call(7, "branch_b", 6),
    call(8, "work", 1), call(9, "shared", 8), call(10, "branch_a", 9)];
  const expanded = traceLayout(calls, functions);
  const compact = traceLayout(calls, functions, { deduplicate: true });
  expect(expanded.blocks).toHaveLength(10);
  expect(compact.blocks).toHaveLength(5);
  expect(compact.blocks.find(block => block.fn.id === "work")!.calls.map(call => call.id)).toEqual([2, 5, 8]);
  expect(compact.patterns.variants).toHaveLength(2);
  const [a, b] = compact.patterns.variants;
  expect(a!.callIds).toEqual([2, 8]); expect(b!.callIds).toEqual([5]);
  expect(a!.color).not.toBe(b!.color);
  expect(compact.edges.filter(edge => edge.from.fn.id === "work" && edge.to.fn.id === "shared").map(edge => [edge.variant?.id, edge.calls.length])).toEqual([[a!.id, 2], [b!.id, 1]]);
  expect(compact.edges.find(edge => edge.to.fn.id === "branch_b")!.variant?.id).toBe(b!.id);
  expect([...traceVariantCalls(compact.patterns, a!.id)].sort((a,b) => a-b)).toEqual([1,2,3,4,8,9,10]);
  const prefix = traceLayout(calls.slice(0,4), functions, { deduplicate: true, contextCalls: calls });
  expect(prefix.patterns.variantByCall.get(4)?.id).toBe(a!.id);
});

test("identical loops reduce to a counted edge even beyond the initial activation limit", () => {
  const calls = [call(1, "test", null), ...Array.from({length: 500}, (_, index) => call(index + 2, "work", 1))];
  const compact = traceLayout(calls, [fn("test"), fn("work")], { deduplicate: true, maxBlocks: 200 });
  expect(compact.blocks).toHaveLength(2);
  expect(compact.totalBlocks).toBe(2);
  expect(compact.patterns.variants).toHaveLength(0);
  expect(compact.blocks[1]!.calls).toHaveLength(500);
  expect(compact.edges).toHaveLength(1);
  expect(compact.edges[0]!.calls).toHaveLength(500);
});

test("call sites, recursion depth and threads stay distinct; generator resumes retain continuation edges", () => {
  const recursive = [call(1,"work",null), call(2,"work",1), call(3,"work",2), { ...call(4,"work",null), thread:2 }, call(5,"work",1,11)];
  expect(traceLayout(recursive,[fn("work")],{deduplicate:true}).blocks).toHaveLength(5);
  const calls = [call(1,"test",null), call(2,"stream",1), {...call(3,"stream",1), kind:"resume" as const, resumeFrom:2}];
  const compact = traceLayout(calls,[fn("test"),fn("stream")],{deduplicate:true});
  expect(compact.blocks).toHaveLength(2);
  expect(compact.edges.some(edge => edge.resume && edge.from === edge.to)).toBe(true);
  expect(tracePatterns(calls).variantByCall.get(3)).toBeDefined();
});
