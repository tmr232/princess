<script lang="ts">
  import { onMount } from "svelte";
  import Panzoom from "@panzoom/panzoom";
  import { traceLayout } from "./traceLayout";
  import type { TestTrace, TraceFunction } from "./trace";
  export let trace: TestTrace;
  export let functions: TraceFunction[];
  let board: HTMLDivElement, viewport: HTMLDivElement;
  let zoom: ReturnType<typeof Panzoom> | undefined;
  let limit = 200;
  let selected = trace.calls[0]?.id ?? 0;
  let step = trace.calls.length;
  $: scene = traceLayout(trace.calls.slice(0, limit), functions);
  $: selectedBlock = scene.blocks.find(block => block.call.id === selected);
  function fit() {
    if (!zoom || !viewport) return;
    const scale = Math.min(1, (viewport.clientWidth - 30) / scene.width, (viewport.clientHeight - 30) / scene.height);
    zoom.zoom(Math.max(0.08, scale), { animate: false }); zoom.pan(0, 0, { animate: false });
  }
  function focus(id: number) {
    selected = id; step = Math.max(step, id);
    const block = scene.blocks.find(block => block.call.id === id);
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
    <label>Reveal calls <input type="range" min="0" max={trace.calls.length} bind:value={step} aria-label="Trace call step" /> {step} / {trace.calls.length}</label>
    <small>Solid arrows: calls · dashed arrows: resumes · scroll to zoom, drag to pan</small>
  </div>
  {#if trace.truncated}<p class="notice">Partial trace: capture limit reached (2,000 activations per case / 10,000 per run).</p>{/if}
  {#if trace.calls.length > limit}<div class="notice">Displaying the first {limit} of {trace.calls.length} calls. <button onclick={() => { limit += 200; }}>Show next 200</button></div>{/if}
  <div class="viewport" bind:this={viewport}>
    <div class="board" bind:this={board} style:width={`${scene.width}px`} style:height={`${scene.height}px`}>
      <svg width={scene.width} height={scene.height} aria-label="Function call connections">
        <defs><marker id="trace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#73869b" /></marker></defs>
        {#each scene.edges.filter(edge => edge.to.call.id <= step && edge.from.call.id <= step) as edge}
          <path d={`M ${edge.from.x + 370} ${edge.from.y + edge.from.height / 2} C ${edge.from.x + 395} ${edge.from.y + edge.from.height / 2}, ${edge.to.x - 25} ${edge.to.y + edge.to.height / 2}, ${edge.to.x} ${edge.to.y + edge.to.height / 2}`} stroke={edge.resume ? "#8a65b8" : "#73869b"} stroke-width="2" stroke-dasharray={edge.resume ? "6 4" : undefined} fill="none" marker-end="url(#trace-arrow)" />
        {/each}
      </svg>
      {#each scene.blocks.filter(block => block.call.id <= step) as block}
        <button class="bubble no-pan" class:selected={selected === block.call.id} class:changed={!!block.fn.change} style:left={`${block.x}px`} style:top={`${block.y}px`} style:height={`${block.height}px`} aria-label={`Call ${block.call.id}: ${block.fn.name}`} onclick={() => selected = block.call.id}>
          <div class="bubble-title"><strong>#{block.call.id} {block.fn.name}</strong><span>{block.call.kind === "resume" ? "resume" : block.fn.change ?? "call"}</span></div>
          <div class="path">{block.fn.path}:{block.fn.line} · thread {block.call.thread}</div>
          <pre><code>{block.preview.join("\n")}</code></pre>
          <div class="bubble-footer">{block.call.parentId ? `Called by #${block.call.parentId} · line ${block.call.callLine}` : "Root activation"}{block.fn.source.split("\n").length > 10 ? " · source preview" : ""}</div>
        </button>
      {/each}
    </div>
  </div>
  {#if selectedBlock}
    <details class="source-details"><summary>Selected call #{selectedBlock.call.id} · {selectedBlock.fn.name} · full source</summary><pre>{selectedBlock.fn.source}</pre></details>
  {/if}
  <div class="call-list" aria-label="Trace call order">
    {#each trace.calls.slice(0, limit) as call}<button class:active={selected === call.id} onclick={() => focus(call.id)}>#{call.id} {functions.find(fn => fn.id === call.functionId)?.name}</button>{/each}
  </div>
</div>
<style>
  .trace-canvas { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  button { font: inherit; cursor: pointer; border: 1px solid #dce3eb; color: #42526a; background: white; border-radius: 5px; padding: 7px 10px; }
  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px; background: white; border-bottom: 1px solid #dce3eb; font-size: 12px; } label { display: flex; align-items: center; gap: 8px; } small { color: #7b8b9f; }
  .viewport { position: relative; flex: 1; min-height: 280px; overflow: hidden; background-color: #f7f9fc; background-image: radial-gradient(#dce3eb 1px, transparent 1px); background-size: 18px 18px; }
  .board { position: relative; transform-origin: 0 0; } svg { position: absolute; top: 0; left: 0; pointer-events: none; }
  .bubble { position: absolute; width: 370px; padding: 0; text-align: left; overflow: hidden; border: 1px solid #bac7d8; border-radius: 8px; background: white; box-shadow: 0 4px 16px #14233612; }
  .bubble.changed { border-color: #5374d6; } .bubble.selected { outline: 3px solid #e2b55b; }
  .bubble-title { display: flex; gap: 8px; align-items: start; justify-content: space-between; background: #edf2fc; padding: 10px 12px; font-size: 12px; } strong { overflow-wrap: anywhere; } .bubble-title span { color: #7b8b9f; font-size: 10px; }
  .path { color: #7b8b9f; padding: 6px 12px; font: 10px monospace; } pre { margin: 0; padding: 8px 12px; font: 11px/17px ui-monospace, monospace; overflow: hidden; white-space: pre; }
  .bubble-footer { padding: 6px 12px; color: #7b8b9f; font-size: 10px; }
  .call-list { display: flex; overflow: auto; gap: 6px; padding: 10px; background: white; border-top: 1px solid #dce3eb; flex-shrink: 0; } .call-list button { white-space: nowrap; font-size: 11px; } .call-list button.active { background: #e9efff; color: #3455aa; }
  .source-details { padding: 10px; background: white; border-top: 1px solid #dce3eb; font-size: 12px; color: #63758a; } summary { cursor: pointer; } .source-details pre { max-height: 220px; overflow: auto; }
  .notice { padding: 10px; margin: 0; font-size: 12px; background: #fff5df; color: #8a682b; }
</style>
