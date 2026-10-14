<script lang="ts">
  import { onMount } from "svelte";
  import type { Review } from "./model";
  import type { CoverageState } from "./coverage";
  export let review: Review;
  export let fileId: string;
  export let selectedId: string;
  let state: CoverageState | null = null;
  let selected: string[] = [];
  let open = false, error = "";
  let timer: ReturnType<typeof setTimeout>;
  let disposed = false;
  async function load() {
    try {
      const response = await fetch("/api/coverage");
      if (!response.ok) throw new Error("Unable to load coverage");
      state = await response.json();
      if (state?.status === "running" && !disposed) timer = setTimeout(load, 700);
    } catch (e) { error = String(e); }
  }
  onMount(() => {
    void load().then(() => { selected = state?.targets.map(t => t.nodeid) ?? []; });
    return () => { disposed = true; clearTimeout(timer); };
  });
  async function run() {
    error = "";
    try {
      const response = await fetch("/api/coverage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tests: selected }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to start coverage");
      state = body;
      clearTimeout(timer);
      void load();
    } catch (e) { error = String(e); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ base: review.base, head: review.head, ...state }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pytest-coverage-${review.head.slice(0, 8)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $: current = state?.functions.find(f => f.fileId === fileId && f.changeId === selectedId);
</script>

<section class="coverage" aria-label="Pytest coverage">
  <button class="heading" aria-expanded={open} onclick={() => open = !open}>
    <strong>{open ? "▾" : "▸"} Pytest coverage</strong>
    <span>{state?.status === "running" ? "Running tests…" : state?.status === "complete" ? `${state.functions.filter(f => f.tests.length).length} / ${state.functions.length} changed functions reached` : `${state?.targets.length ?? 0} changed tests available`}</span>
  </button>
  {#if open}
    <div class="content">
      <p>Run selected changed tests against head <code>{review.head.slice(0,8)}</code> in an isolated snapshot. This executes repository code. Requires uv, pytest and pytest-cov.</p>
      <div class="columns">
        <div>
          <h3>Changed tests</h3>
          {#each state?.targets ?? [] as target}
            <label><input type="checkbox" value={target.nodeid} bind:group={selected} disabled={state?.status === "running"} /><code>{target.nodeid}</code></label>
          {:else}<p>No added or modified pytest tests detected. Conventional test_*.py / *_test.py names are supported.</p>{/each}
          <button class="run" disabled={!selected.length || state?.status === "running"} onclick={run}>{state?.status === "running" ? "Running…" : "Run selected tests with coverage"}</button>
          <small>uv run pytest … --cov=. --cov-context=test</small>
        </div>
        <div>
          <h3>Tests covering selected function</h3>
          {#if current}
            <code>{current.name}</code>
            {#if current.tests.length}
              <p class="success">{current.covered.length} / {current.executable.length} executable body lines reached</p>
              {#each current.tests as test}<div class="test"><span>✓</span> <code>{test}</code></div>{/each}
            {:else}<p>No selected test reached this function body.</p>{/if}
          {:else}<p>{state?.status === "complete" ? "Select a changed function present in the head revision." : "Run coverage to see test → function attribution."}</p>{/if}
          <small>Attribution uses test call contexts; definition/import execution does not count. Reaching a function does not imply every branch is covered.</small>
        </div>
      </div>
      {#if error || state?.error}<p class="error" role="alert">{error || state?.error}</p>{/if}
      {#if state?.status === "complete"}
        <p role="status" class:success={state.exitCode === 0}>Pytest exit code {state.exitCode}{state.exitCode === 0 ? " · Tests passed" : " · Tests did not all pass; partial coverage shown"}</p>
        <button class="download" onclick={download}>Download coverage JSON</button>
        <details><summary>All changed functions · {state.functions.length}</summary>
          <table><thead><tr><th>Function</th><th>Covering tests</th></tr></thead><tbody>
            {#each state.functions as fn}<tr><td><code>{fn.path}::{fn.name}</code></td><td>{#each fn.tests as test}<div><code>{test}</code></div>{:else}<span>Not reached</span>{/each}</td></tr>{/each}
          </tbody></table>
        </details>
      {/if}
      {#if state?.command}<details><summary>Command and run output</summary><pre>{state.command}\n{state.output}</pre></details>{/if}
    </div>
  {/if}
</section>
<style>
  .coverage { background: white; border: 1px solid #dce3eb; border-radius: 8px; margin-bottom: 18px; max-height: 55vh; overflow: auto; flex-shrink: 0; font-size: 12px; }
  button { font: inherit; cursor: pointer; }
  .heading { display: flex; justify-content: space-between; gap: 12px; width: 100%; background: #edf2fc; border: 0; color: #3455aa; padding: 13px 16px; text-align: left; }
  .content { padding: 0 16px 16px; } p { color: #63758a; line-height: 1.6; } h3 { font-size: 12px; margin-top: 0; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 20px 0; }
  label { display: flex; align-items: start; gap: 8px; margin: 10px 0; } code { overflow-wrap: anywhere; font-size: 11px; } small { display: block; color: #7b8b9f; line-height: 1.6; }
  .run { background: #3455aa; border: 0; color: white; border-radius: 5px; padding: 10px 14px; margin: 8px 0; } .run:disabled { opacity: .5; cursor: default; }
  .download { border: 1px solid #dce3eb; background: #f7f9fc; color: #3455aa; padding: 8px 12px; border-radius: 5px; }
  .success, .test span { color: #258459; } .test { margin: 8px 0; } .error { color: #a33340; white-space: pre-wrap; }
  details { margin-top: 12px; } summary { cursor: pointer; color: #3455aa; } pre { white-space: pre-wrap; max-height: 220px; overflow: auto; font-size: 11px; background: #f7f9fc; padding: 12px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; } th, td { padding: 8px; border-bottom: 1px solid #dce3eb; text-align: left; vertical-align: top; }
  @media(max-width:850px) { .columns { grid-template-columns: 1fr; } }
</style>
