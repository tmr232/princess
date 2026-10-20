<script lang="ts">
  import { onMount } from "svelte";
  import type { Review } from "./model";
  import type { TraceState } from "./trace";
  import TraceCanvas from "./TraceCanvas.svelte";
  export let review: Review;
  export let state: TraceState | null = null;
  let selected: string[] = [];
  let testId = "", error = "";
  let timer: ReturnType<typeof setTimeout>;
  let disposed = false;
  $: current = state?.tests.find(test => test.nodeid === testId);
  async function load() {
    try {
      const response = await fetch("/api/trace");
      if (!response.ok) throw new Error("Unable to load function traces");
      state = await response.json();
      if (state?.status === "complete" && !state.tests.some(test => test.nodeid === testId)) testId = state.tests[0]?.nodeid ?? "";
      if (state?.status === "running" && !disposed) timer = setTimeout(load, 700);
    } catch (e) { error = String(e); }
  }
  onMount(() => {
    void load().then(() => { selected = state?.targets.map(target => target.nodeid) ?? []; });
    return () => { disposed = true; clearTimeout(timer); };
  });
  async function run() {
    error = "";
    try {
      const response = await fetch("/api/trace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tests: selected }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to start function tracing");
      state = body; clearTimeout(timer); void load();
    } catch (e) { error = String(e); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ base: review.base, head: review.head, ...state }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `function-trace-${review.head.slice(0,8)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="workspace">
  <aside>
    <h2>TRACE CHANGED TESTS</h2>
    <div class="selection">
      {#each state?.targets ?? [] as target}<label><input type="checkbox" value={target.nodeid} bind:group={selected} disabled={state?.status === "running"} /><code>{target.nodeid}</code></label>{:else}<p>No added or modified pytest tests detected.</p>{/each}
      <button class="run" disabled={!selected.length || state?.status === "running"} onclick={run}>{state?.status === "running" ? "Tracing…" : "Run selected tests with tracing"}</button>
      <small>uv run pytest · function tracing · no coverage</small>
    </div>
    <h2>RECORDED TEST CASES</h2>
    <nav aria-label="Recorded traces">
      {#each state?.tests ?? [] as test}<button class="case" class:active={testId === test.nodeid} onclick={() => testId = test.nodeid}><code>{test.nodeid}</code><small>{test.outcome} · {test.calls.length} calls{test.truncated ? " · partial" : ""}</small></button>{:else}<p class="muted">Run tracing to populate the canvas.</p>{/each}
    </nav>
    <footer>Repository Python calls during test bodies, including unchanged functions. One block per activation. Call records contain no arguments, locals, or return values.</footer>
  </aside>
  <article>
    <div class="heading"><div><small>HEAD · {review.head.slice(0,8)}</small><h1>Function trace</h1></div>{#if state?.status === "complete"}<button onclick={download}>Download trace JSON</button>{/if}</div>
    {#if error || state?.error}<p class="error" role="alert">{error || state?.error}</p>{/if}
    {#if state?.status === "complete"}<p class="run-status" role="status">Pytest exit code {state.exitCode}{state.exitCode === 0 ? " · Tests passed" : " · Tests did not all pass; available traces shown"}</p>{/if}
    <div class="canvas-frame">
      {#if current}
        <div class="case-title"><code>{current.nodeid}</code><span>{current.outcome} · {current.calls.length} activations{current.truncated ? " · capture limit reached" : ""}</span></div>
        {#if current.calls.length}{#key current.nodeid}<TraceCanvas trace={current} functions={state!.functions} />{/key}
        {:else}<div class="empty">{current.truncated ? "Capture limit was reached before this case could be recorded." : "No repository function calls captured for this case. Setup/teardown and external libraries are outside the trace scope."}</div>{/if}
      {:else}<div class="empty"><h2>{state?.status === "running" ? "Recording function flow…" : "Follow a test through the code"}</h2><p>Run selected tests, then choose a recorded case to see its function-call canvas.</p><p>Capture runs against an isolated head snapshot and executes repository code. Requires uv and pytest.</p></div>{/if}
    </div>
    {#if state?.command}<details class="output"><summary>Command and run output</summary><pre>{state.command}\n{state.output}</pre></details>{/if}
  </article>
</div>
<style>
  .workspace { display: grid; grid-template-columns: 340px minmax(0, 1fr); height: 100%; color: #243447; }
  aside { background: white; border-right: 1px solid #dce3eb; overflow: auto; } h2 { font-size: 10px; letter-spacing: 1.5px; color: #63758a; margin: 22px 18px; }
  .selection { padding: 0 18px 20px; border-bottom: 1px solid #dce3eb; } label { display: flex; align-items: start; gap: 8px; margin: 12px 0; } code { font-size: 11px; overflow-wrap: anywhere; }
  button { font: inherit; cursor: pointer; border: 1px solid #dce3eb; color: #3455aa; background: white; border-radius: 5px; padding: 9px 12px; font-size: 12px; } button:disabled { opacity: .5; cursor: default; }
  .run { background: #3455aa; color: white; margin: 8px 0; width: 100%; } small { font-size: 11px; color: #7b8b9f; } .selection small { display: block; } .case { width: 100%; border: 0; border-radius: 0; text-align: left; padding: 12px 18px; } .case small { display: block; margin-top: 6px; } .case.active { background: #e9efff; box-shadow: inset 3px 0 #5374d6; }
  footer, .muted, .selection p { padding: 18px; color: #8b98a8; font-size: 11px; line-height: 1.7; }
  article { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 24px; } .heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; } h1 { font-size: 23px; margin: 5px 0; }
  .canvas-frame { background: white; border: 1px solid #dce3eb; border-radius: 8px; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
  .case-title { padding: 14px; display: flex; justify-content: space-between; gap: 12px; background: #edf2fc; } .case-title span { font-size: 11px; color: #7b8b9f; }
  .empty { margin: auto; padding: 30px; max-width: 580px; text-align: center; color: #7b8b9f; font-size: 13px; line-height: 1.8; } .empty h2 { font-size: 18px; letter-spacing: 0; }
  .error { padding: 12px; background: #fff0f1; color: #a33340; white-space: pre-wrap; font-size: 12px; } .run-status { margin: 0 0 12px; font-size: 12px; color: #63758a; }
  .output { margin-top: 12px; color: #63758a; font-size: 12px; } summary { cursor: pointer; } pre { max-height: 160px; overflow: auto; background: white; padding: 12px; white-space: pre-wrap; font-size: 11px; }
  @media(max-width:900px) { .workspace { grid-template-columns: 280px minmax(0,1fr); } article { padding: 14px; } }
</style>
