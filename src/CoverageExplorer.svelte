<script lang="ts">
  import { coverageNavigation, type CoverageFunctionNode, type CoverageTestNode } from "./coverageNavigation";
  import type { CoverageState } from "./coverage";
  import type { Review } from "./model";
  import CoverageCode from "./CoverageCode.svelte";
  export let review: Review;
  export let state: CoverageState | null;
  export let initialSelection: { fileId: string; changeId: string } | null = null;
  let lastInitial: typeof initialSelection = null;
  let direction: "tests" | "functions" = "tests";
  let functionKey = "", testKey = "";
  let sources = new Map<string, string>();
  let loading = false, error = "", generation = 0;
  const key = (fn: CoverageFunctionNode) => `${fn.fileId}:${fn.changeId}`;
  $: navigation = coverageNavigation(review, state);
  $: selectedFunction = navigation.functions.find(fn => key(fn) === functionKey);
  $: selectedTest = navigation.tests.find(test => test.nodeid === testKey);
  $: testFile = review.files.find(file => file.id === selectedTest?.target.fileId);
  $: testSymbol = testFile?.changes.find(change => change.id === selectedTest?.target.changeId)?.after;
  $: associatedTests = selectedFunction ? navigation.tests.filter(test => selectedFunction.tests.includes(test.nodeid)) : [];
  $: if (initialSelection && initialSelection !== lastInitial) {
    lastInitial = initialSelection;
    const fn = navigation.functions.find(fn => fn.fileId === initialSelection!.fileId && fn.changeId === initialSelection!.changeId);
    const test = navigation.tests.find(test => test.target.fileId === initialSelection!.fileId && test.target.changeId === initialSelection!.changeId);
    if (fn) chooseFunction(fn); else if (test) chooseTest(test);
  }
  $: if (!functionKey && !testKey && navigation.functions.length) chooseFunction(navigation.functions[0]!);
  $: loadSources(selectedFunction?.fileId, selectedTest?.target.fileId);

  function chooseFunction(fn: CoverageFunctionNode, test?: CoverageTestNode) {
    functionKey = key(fn);
    testKey = test?.nodeid ?? "";
  }
  function chooseTest(test: CoverageTestNode, fn?: CoverageFunctionNode) {
    testKey = test.nodeid;
    functionKey = fn ? key(fn) : test.functions[0] ? key(test.functions[0]) : "";
  }
  async function loadSources(functionId?: string, testId?: string) {
    const current = ++generation;
    error = "";
    const ids = [...new Set([functionId, testId].filter((id): id is string => id !== undefined))];
    const missing = ids.filter(id => !sources.has(id));
    if (!missing.length) { loading = false; return; }
    loading = true;
    try {
      const loaded = await Promise.all(missing.map(async id => {
        const response = await fetch(`/api/source/${id}`);
        if (!response.ok) throw new Error("Unable to load head source");
        const data = await response.json();
        if (typeof data.after !== "string") throw new Error("No head source available");
        return [id, data.after] as const;
      }));
      if (current === generation) sources = new Map([...sources, ...loaded]);
    } catch (e) { if (current === generation) error = String(e); }
    finally { if (current === generation) loading = false; }
  }
</script>

<div class="workspace">
  <aside>
    <h2>COVERAGE ASSOCIATIONS</h2>
    <div class="directions" role="group" aria-label="Coverage navigation direction">
      <button class:active={direction === "tests"} aria-pressed={direction === "tests"} onclick={() => direction = "tests"}>By test</button>
      <button class:active={direction === "functions"} aria-pressed={direction === "functions"} onclick={() => direction = "functions"}>By function</button>
    </div>
    <nav aria-label="Coverage navigation">
      {#if direction === "tests"}
        {#each navigation.tests as test}
          <details open>
            <summary><button class:active={testKey === test.nodeid} aria-label={`Select test ${test.nodeid}`} onclick={() => chooseTest(test)}><span>τ</span><code>{test.nodeid}</code><small>{test.functions.length}</small></button></summary>
            {#each test.functions as fn}
              <button class="child" class:active={testKey === test.nodeid && functionKey === key(fn)} aria-label={`View ${fn.path}::${fn.name} covered by ${test.nodeid}`} onclick={() => chooseTest(test, fn)}><span>ƒ</span><code>{fn.path}::{fn.name}</code></button>
            {:else}<p class="empty-tree">{state?.status === "complete" ? "No changed functions reached" : "Run tests to see associations"}</p>{/each}
          </details>
        {:else}<p class="empty-tree">No changed pytest tests detected.</p>{/each}
      {:else}
        {#each navigation.functions as fn}
          <details open>
            <summary><button class:active={functionKey === key(fn)} aria-label={`Select function ${fn.path}::${fn.name}`} onclick={() => chooseFunction(fn)}><span>ƒ</span><code>{fn.path}::{fn.name}</code><small>{fn.tests.length}</small></button></summary>
            {#each navigation.tests.filter(test => fn.tests.includes(test.nodeid)) as test}
              <button class="child" class:active={functionKey === key(fn) && testKey === test.nodeid} aria-label={`View ${test.nodeid} covering ${fn.path}::${fn.name}`} onclick={() => chooseFunction(fn, test)}><span>τ</span><code>{test.nodeid}</code></button>
            {:else}<p class="empty-tree">{state?.status === "complete" ? "No changed tests reached this function" : "Run tests to see associations"}</p>{/each}
          </details>
        {:else}<p class="empty-tree">No added or modified non-test functions.</p>{/each}
      {/if}
    </nav>
    <footer>Added and modified tests ↔ added and modified functions. Parametrized cases retain their identities.</footer>
  </aside>
  <article>
    <div class="heading"><div><small>HEAD · {review.head.slice(0,8)}</small><h1>Coverage associations</h1></div><span class="badge">{state?.status === "complete" ? "Coverage available" : state?.status === "running" ? "Run in progress" : "No completed run"}</span></div>
    <div class="legend"><span class="covered">● Covered</span><span class="uncovered">● Not covered</span><span class="outside">● Outside test calls</span><small>Head source · click a highlighted line for test attribution</small></div>
    {#if state?.status !== "complete"}<p class="notice">Run tests in the Run tests tab to populate coverage associations.</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="association">
      {#if selectedTest}<code>{selectedTest.nodeid}</code>{:else}<span>All associated tests</span>{/if}
      <span>→</span>{#if selectedFunction}<code>{selectedFunction.path}::{selectedFunction.name}</code>{:else}<span>Select a function</span>{/if}
      {#if selectedFunction && selectedTest}<button onclick={() => chooseFunction(selectedFunction!)}>Show all covering tests</button>{/if}
    </div>
    <div class="panes">
      <section class="pane" aria-label="Selected test source">
        <div class="pane-title"><strong>Test</strong><small>{testFile?.path ?? "Changed tests"}</small></div>
        {#if selectedTest && testSymbol}
          <h3>{selectedTest.nodeid}</h3>
          <div class="related"><strong>Reached functions</strong>{#each selectedTest.functions as fn}<button onclick={() => chooseTest(selectedTest!, fn)}>{fn.name}</button>{:else}<span>No changed functions reached</span>{/each}</div>
          {#if sources.has(selectedTest.target.fileId)}
            {#key selectedTest.target.fileId + selectedTest.target.changeId}
              <CoverageCode source={sources.get(selectedTest.target.fileId)!} symbol={testSymbol} path={testFile!.path} coverage={state?.status === "complete" ? state.report?.files[testFile!.path] : undefined} test={selectedTest.nodeid} />
            {/key}
          {:else}<p class="empty">{loading ? "Loading test source…" : "Test source unavailable"}</p>{/if}
        {:else}
          <div class="empty"><p>Select a covering test to inspect the pair.</p>{#each associatedTests as test}<button onclick={() => chooseFunction(selectedFunction!, test)}>{test.nodeid}</button>{:else}<p>{state?.status === "complete" ? "No changed tests reached this function." : "Run tests to see associations."}</p>{/each}</div>
        {/if}
      </section>
      <section class="pane" aria-label="Selected function source">
        <div class="pane-title"><strong>Function</strong><small>{selectedFunction?.path ?? "Changed functions"}</small></div>
        {#if selectedFunction}
          <h3>{selectedFunction.name} <small>{selectedFunction.status}</small></h3>
          <div class="related"><strong>Covering tests</strong>{#each associatedTests as test}<button class:active={test.nodeid === testKey} onclick={() => chooseFunction(selectedFunction!, test)}>{test.nodeid}</button>{:else}<span>No changed tests reached this function</span>{/each}</div>
          {#if sources.has(selectedFunction.fileId)}
            {#key key(selectedFunction)}
              <CoverageCode source={sources.get(selectedFunction.fileId)!} symbol={selectedFunction.symbol} path={selectedFunction.path} coverage={state?.status === "complete" ? state.report?.files[selectedFunction.path] : undefined} test={selectedTest?.nodeid ?? ""} />
            {/key}
          {:else}<p class="empty">{loading ? "Loading function source…" : "Function source unavailable"}</p>{/if}
        {:else}<p class="empty">Choose a changed function under a test, or switch to By function.</p>{/if}
      </section>
    </div>
  </article>
</div>
<style>
  .workspace { display: grid; grid-template-columns: 340px minmax(0, 1fr); height: 100%; color: #243447; }
  aside { background: white; border-right: 1px solid #dce3eb; overflow: auto; }
  aside h2 { font-size: 10px; letter-spacing: 1.5px; color: #63758a; margin: 22px 18px; }
  button { font: inherit; cursor: pointer; color: #42526a; border: 0; background: transparent; }
  button:hover { background: #f1f5fc; } button.active { background: #e9efff; color: #3455aa; }
  .directions { display: flex; padding: 0 18px 16px; gap: 8px; } .directions button { border: 1px solid #dce3eb; border-radius: 5px; padding: 8px 14px; font-size: 12px; }
  details { border-top: 1px solid #edf0f4; padding: 8px 10px; } summary { display: flex; cursor: pointer; align-items: center; } summary::before { content: "▸"; color: #8b98a8; } details[open] > summary::before { content: "▾"; }
  summary button, .child { display: flex; align-items: start; gap: 8px; padding: 10px 8px; text-align: left; width: 100%; border-radius: 4px; }
  summary button code, .child code { flex: 1; } .child { padding-left: 25px; } code { font-size: 11px; overflow-wrap: anywhere; }
  small { color: #7b8b9f; font-size: 11px; } .empty-tree { font-size: 11px; color: #7b8b9f; margin: 10px 22px; }
  footer { font-size: 11px; color: #8b98a8; padding: 20px; line-height: 1.7; }
  article { padding: 24px; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; } h1 { font-size: 23px; margin: 4px 0; } .badge { background: #edf2fc; padding: 8px 12px; border-radius: 5px; font-size: 12px; color: #3455aa; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; margin-bottom: 12px; } .covered { color: #258459; } .uncovered { color: #c2525a; } .outside { color: #7b8b9f; }
  .association { display: flex; align-items: center; gap: 12px; padding: 14px; background: #edf2fc; border-radius: 6px; margin-bottom: 18px; font-size: 12px; flex-wrap: wrap; } .association button { margin-left: auto; color: #3455aa; text-decoration: underline; }
  .panes { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; flex: 1; min-height: 0; }
  .pane { background: white; border: 1px solid #dce3eb; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .pane-title { padding: 16px; display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e9edf2; font-size: 13px; } h3 { font-size: 13px; padding: 16px; margin: 0; overflow-wrap: anywhere; }
  .related { padding: 0 16px 14px; font-size: 11px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-bottom: 1px solid #e9edf2; color: #7b8b9f; } .related button { font-size: 11px; border: 1px solid #dce3eb; border-radius: 4px; padding: 5px; overflow-wrap: anywhere; }
  .empty { margin: auto; padding: 24px; font-size: 12px; color: #7b8b9f; text-align: center; } .empty button { display: block; font-size: 12px; color: #3455aa; padding: 8px; overflow-wrap: anywhere; }
  .notice, .error { font-size: 12px; padding: 12px; background: #edf2fc; color: #63758a; } .error { color: #a33340; }
  @media(max-width:950px) { .workspace { grid-template-columns: 280px minmax(0, 1fr); } .panes { grid-template-columns: 1fr; overflow: auto; } .pane { min-height: 300px; } article { padding: 16px; } }
</style>
