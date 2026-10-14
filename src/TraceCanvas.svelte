<script lang="ts">
  import { onMount, tick } from "svelte";
  import Panzoom from "@panzoom/panzoom";
  import { traceLayout, traceVariantCalls, type TraceEdge } from "./traceLayout";
  import type { TestTrace, TraceFunction } from "./trace";
  export let trace: TestTrace;
  export let functions: TraceFunction[];
  let board: HTMLDivElement, viewport: HTMLDivElement;
  let zoom: ReturnType<typeof Panzoom> | undefined;
  let deduplicate = false;
  let pattern = "";
  let patternLimit = 12;
  let limit = 200;
  let selected = trace.calls[0]?.id ?? 0;
  let step = trace.calls.length;
  $: scene = traceLayout(deduplicate ? trace.calls : trace.calls.slice(0, limit), functions, { deduplicate, contextCalls: trace.calls, maxBlocks: limit });
  $: allowed = pattern && deduplicate ? traceVariantCalls(scene.patterns, pattern) : null;
  $: includedIds = new Set(scene.blocks.flatMap(block => block.calls.map(call => call.id)));
  $: visibleCalls = trace.calls.filter(call => includedIds.has(call.id) && call.id <= step && (!allowed || allowed.has(call.id)));
  $: visibleIds = new Set(visibleCalls.map(call => call.id));
  $: visibleBlocks = scene.blocks.filter(block => block.calls.some(call => visibleIds.has(call.id)));
  $: visibleEdges = scene.edges.filter(edge => visibleBlocks.includes(edge.from) && visibleBlocks.includes(edge.to) && edge.calls.some(call => visibleIds.has(call.id)));
  $: arrowMarkers = [...new Map(visibleEdges.map(edge => [edge.variant?.id ?? (edge.resume ? "resume" : "shared"), edge.variant?.color ?? (edge.resume ? "#8a65b8" : "#73869b")])).entries()];
  $: if (!visibleIds.has(selected)) selected = visibleCalls.at(-1)?.id ?? 0;
  $: selectedBlock = scene.blocks.find(block => block.calls.some(call => call.id === selected));
  $: visibleVariants = deduplicate ? scene.patterns.variants.filter(variant => variant.id === pattern || variant.callIds.some(id => includedIds.has(id) && id <= step)) : [];
  function members(block: typeof scene.blocks[number]) { return block.calls.filter(call => visibleIds.has(call.id)); }
  function edgeCalls(edge: TraceEdge) { return edge.calls.filter(call => visibleIds.has(call.id)); }
  function edgePath(edge: TraceEdge) {
    const parallels = visibleEdges.filter(other => other.from === edge.from && other.to === edge.to && other.resume === edge.resume);
    const offset = (parallels.indexOf(edge) - (parallels.length - 1) / 2) * 18;
    const x = edge.from.x + 370, y = edge.from.y + edge.from.height / 2 + offset;
    const targetY = edge.to.y + edge.to.height / 2 + offset;
    if (edge.from === edge.to) return `M ${x} ${y - 20} C ${x + 65} ${y - 55}, ${x + 65} ${y + 55}, ${x} ${y + 20}`;
    return `M ${x} ${y} C ${x + 25} ${y}, ${edge.to.x - 25} ${targetY}, ${edge.to.x} ${targetY}`;
  }
  async function toggleDedup() { deduplicate = !deduplicate; pattern = ""; await tick(); fit(); }
  function variantName(id: string) { return functions.find(fn => fn.id === id)?.name ?? id; }
  async function filterPattern(id: string) { pattern = pattern === id ? "" : id; if (pattern) selected = scene.patterns.variants.find(variant => variant.id === id)?.callIds[0] ?? selected; await tick(); fit(); }
  function fit() {
    if (!zoom || !viewport) return;
    const scale = Math.min(1, (viewport.clientWidth - 30) / scene.width, (viewport.clientHeight - 30) / scene.height);
    zoom.zoom(Math.max(0.08, scale), { animate: false }); zoom.pan(0, 0, { animate: false });
  }
  function focus(id: number) {
    selected = id; step = Math.max(step, id);
    if (allowed && !allowed.has(id)) pattern = "";
    const block = scene.blocks.find(block => block.calls.some(call => call.id === id));
    if (!block || !zoom) return;
    const scale = Math.min(1, viewport.clientWidth / 800);
    zoom.zoom(scale, { animate: false });
    zoom.pan(viewport.clientWidth / (2 * scale) - block.x - 185, viewport.clientHeight / (2 * scale) - block.y - block.height / 2, { animate: false });
  }
  onMount(() => {
    zoom = Panzoom(board, { minScale: 0.08, maxScale: 3, origin: "0 0", startX: 0, startY: 0, cursor: "grab", excludeClass: "no-pan" });
    const wheel = (event: WheelEvent) => zoom?.zoomWithWheel(event);
    viewport.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(() => { if (viewport.clientWidth && viewport.clientHeight) fit(); });
    observer.observe(viewport);
    return () => { observer.disconnect(); viewport.removeEventListener("wheel", wheel); zoom?.destroy(); };
  });
</script>

<div class="trace-canvas">
  <div class="controls">
    <button onclick={fit}>Fit canvas</button><button aria-label="Zoom in" onclick={() => zoom?.zoomIn()}>+</button><button aria-label="Zoom out" onclick={() => zoom?.zoomOut()}>−</button>
    <button aria-pressed={deduplicate} onclick={toggleDedup}>Deduplicate call stacks</button>
    <label>Reveal calls <input type="range" min="0" max={trace.calls.length} bind:value={step} aria-label="Trace call step" /> {step} / {trace.calls.length}</label>
    <small>Solid arrows: calls · dashed arrows: resumes · scroll to zoom, drag to pan</small>
  </div>
  {#if deduplicate}
    <div class="dedup-info" role="status">{visibleCalls.length} activations → {visibleBlocks.length} blocks · identical stacks share a block; counts retain repetitions.</div>
    {#if visibleVariants.length}
      <div class="variants" aria-label="Distinct trace paths"><strong>Different downstream paths</strong>
        {#each visibleVariants.slice(0, patternLimit) as variant}<button class:active={pattern === variant.id} aria-pressed={pattern === variant.id} aria-label={`Filter ${variantName(variant.name)} path ${variant.index}`} onclick={() => filterPattern(variant.id)}><span style:background={variant.color}></span>{variantName(variant.name)} · path {variant.index} · calls {variant.callIds.slice(0, 6).map(id => `#${id}`).join(", ")}{variant.callIds.length > 6 ? ` +${variant.callIds.length - 6} more` : ""}</button>{/each}
        {#if visibleVariants.length > patternLimit}<button onclick={() => patternLimit += 12}>Show more paths ({visibleVariants.length})</button>{/if}
        {#if pattern}<button onclick={() => filterPattern(pattern)}>Show all paths</button>{/if}
        <small>Arrow colors identify invocation paths within this test case. Click a path to isolate it.</small>
      </div>
    {/if}
  {/if}
  {#if trace.truncated}<p class="notice">Partial trace: capture limit reached (2,000 activations per case / 10,000 per run).</p>{/if}
  {#if (deduplicate ? scene.totalBlocks : trace.calls.length) > limit}<div class="notice">Displaying the first {limit} of {deduplicate ? scene.totalBlocks : trace.calls.length} {deduplicate ? "call stacks" : "calls"}. <button onclick={() => { limit += 200; }}>Show next 200</button></div>{/if}
  <div class="viewport" bind:this={viewport}>
    <div class="board" bind:this={board} style:width={`${scene.width}px`} style:height={`${scene.height}px`}>
      <svg width={scene.width} height={scene.height} aria-label="Function call connections">
        <defs>{#each arrowMarkers as [id, color]}<marker id={`trace-arrow-${id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill={color} /></marker>{/each}</defs>
        {#each visibleEdges as edge}
          <path d={edgePath(edge)} data-path={edge.variant?.id ?? "shared"} data-count={edgeCalls(edge).length} stroke={edge.variant?.color ?? (edge.resume ? "#8a65b8" : "#73869b")} stroke-width="2" stroke-dasharray={edge.resume ? "6 4" : edge.variant?.dash} fill="none" marker-end={`url(#trace-arrow-${edge.variant?.id ?? (edge.resume ? "resume" : "shared")})`}>
            <title>{edge.variant ? `${variantName(edge.variant.name)} path ${edge.variant.index} · ` : ""}{edgeCalls(edge).map(call => `#${call.id}`).join(", ")}</title>
          </path>
          {#if deduplicate}
            <text x={(edge.from.x + 370 + edge.to.x) / 2} y={(edge.from.y + edge.from.height / 2 + edge.to.y + edge.to.height / 2) / 2 + (visibleEdges.filter(other => other.from === edge.from && other.to === edge.to).indexOf(edge) * 18) - 5} fill={edge.variant?.color ?? "#63758a"} font-size="10" text-anchor="middle">{edge.variant ? `P${edge.variant.index}` : ""}{edgeCalls(edge).length > 1 ? ` ×${edgeCalls(edge).length}` : ""}</text>
          {/if}
        {/each}
      </svg>
      {#each visibleBlocks as block}
        <button class="bubble no-pan" class:selected={block.calls.some(call => call.id === selected)} class:changed={!!block.fn.change} style:left={`${block.x}px`} style:top={`${block.y}px`} style:height={`${block.height}px`} aria-label={deduplicate ? `Call stack ${block.fn.name}: ${members(block).length} activations` : `Call ${block.call.id}: ${block.fn.name}`} onclick={() => selected = members(block)[0]!.id}>
          <div class="bubble-title"><strong>{deduplicate && members(block).length > 1 ? `×${members(block).length}` : `#${deduplicate ? members(block)[0]!.id : block.call.id}`} {block.fn.name}</strong><span>{block.call.kind === "resume" ? "resume" : block.fn.change ?? "call"}</span></div>
          <div class="path">{block.fn.path}:{block.fn.line} · thread {block.call.thread}</div>
          <pre><code>{block.preview.join("\n")}</code></pre>
          <div class="bubble-footer">{deduplicate && members(block).length > 1 ? `Calls ${members(block).slice(0, 6).map(call => `#${call.id}`).join(", ") + (members(block).length > 6 ? ` +${members(block).length - 6} more` : "")} · ` : ""}{members(block)[0]!.parentId ? `Called by #${members(block)[0]!.parentId} · line ${members(block)[0]!.callLine}` : "Root activation"}{block.fn.source.split("\n").length > 10 ? " · source preview" : ""}</div>
        </button>
      {/each}
    </div>
  </div>
  {#if selectedBlock}
    <details class="source-details"><summary>Selected call #{selected} · {selectedBlock.fn.name} · full source</summary>{#if deduplicate && members(selectedBlock).length > 1}<label class="invocation">Invocation <select aria-label="Collapsed invocation" value={selected} onchange={(event) => selected = Number(event.currentTarget.value)}>{#each members(selectedBlock) as call}<option value={call.id}>#{call.id}{scene.patterns.variantByCall.get(call.id) ? ` · path ${scene.patterns.variantByCall.get(call.id)!.index}` : ""}</option>{/each}</select></label>{/if}<pre>{selectedBlock.fn.source}</pre></details>
  {/if}
  <div class="call-list" aria-label="Trace call order">
    {#each trace.calls.slice(0, limit) as call}<button class:active={selected === call.id} onclick={() => focus(call.id)}>#{call.id} {functions.find(fn => fn.id === call.functionId)?.name}</button>{/each}
  </div>
</div>
<style>
  .trace-canvas { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  button { font: inherit; cursor: pointer; border: 1px solid #dce3eb; color: #42526a; background: white; border-radius: 5px; padding: 7px 10px; }
  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px; background: white; border-bottom: 1px solid #dce3eb; font-size: 12px; } label { display: flex; align-items: center; gap: 8px; } small { color: #7b8b9f; }
  .controls button[aria-pressed="true"] { background: #e9efff; color: #3455aa; border-color: #b6c6f4; }
  .viewport { position: relative; flex: 1; min-height: 280px; overflow: hidden; background-color: #f7f9fc; background-image: radial-gradient(#dce3eb 1px, transparent 1px); background-size: 18px 18px; }
  .board { position: relative; transform-origin: 0 0; } svg { position: absolute; top: 0; left: 0; pointer-events: none; }
  .bubble { position: absolute; width: 370px; padding: 0; text-align: left; overflow: hidden; border: 1px solid #bac7d8; border-radius: 8px; background: white; box-shadow: 0 4px 16px #14233612; }
  .bubble.changed { border-color: #5374d6; } .bubble.selected { outline: 3px solid #e2b55b; }
  .bubble-title { display: flex; gap: 8px; align-items: start; justify-content: space-between; background: #edf2fc; padding: 10px 12px; font-size: 12px; } strong { overflow-wrap: anywhere; } .bubble-title span { color: #7b8b9f; font-size: 10px; }
  .path { color: #7b8b9f; padding: 6px 12px; font: 10px monospace; } pre { margin: 0; padding: 8px 12px; font: 11px/17px ui-monospace, monospace; overflow: hidden; white-space: pre; }
  .bubble-footer { padding: 6px 12px; color: #7b8b9f; font-size: 10px; }
  .call-list { display: flex; overflow: auto; gap: 6px; padding: 10px; background: white; border-top: 1px solid #dce3eb; flex-shrink: 0; } .call-list button { white-space: nowrap; font-size: 11px; } .call-list button.active { background: #e9efff; color: #3455aa; }
  .source-details { padding: 10px; background: white; border-top: 1px solid #dce3eb; font-size: 12px; color: #63758a; } summary { cursor: pointer; } .source-details pre { max-height: 220px; overflow: auto; }
  .dedup-info { padding: 8px 12px; background: #edf2fc; color: #3455aa; font-size: 12px; }
  .variants { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; background: white; border-bottom: 1px solid #dce3eb; font-size: 11px; }
  .variants button { font-size: 11px; display: flex; align-items: center; gap: 6px; } .variants button.active { background: #e9efff; } .variants span { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; } .variants small { flex-basis: 100%; }
  .invocation { display: flex; gap: 8px; align-items: center; padding: 10px; font-size: 12px; } select { font: inherit; border: 1px solid #dce3eb; padding: 5px; }
  .notice { padding: 10px; margin: 0; font-size: 12px; background: #fff5df; color: #8a682b; }
</style>
