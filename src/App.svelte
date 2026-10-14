<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    reviewSchema,
    type Review,
    type Change,
    type SymbolInfo,
  } from "./model";
  import { graph } from "./graphs";
  import GraphPane from "./GraphPane.svelte";
  import ReviewTree from "./ReviewTree.svelte";
  import CodeDiff from "./CodeDiff.svelte";
  import type { CoverageState } from "./coverage";
  import CoverageExplorer from "./CoverageExplorer.svelte";
  import TraceView from "./TraceView.svelte";
  import type { TraceState } from "./trace";
  import CoveragePanel from "./CoveragePanel.svelte";
  import FunctionGraphs from "./FunctionGraphs.svelte";
  type View = "graph" | "code" | "functions" | "combined";
  let tab: "review" | "coverage" = "review";
  let traceState: TraceState | null = null;
  let coverageState: CoverageState | null = null;
  let view: View = "graph";
  let singleView: Exclude<View, "functions"> = "graph";
  let functionsOpened = false;
  let returnToFunctions = false;
  let backButton: HTMLButtonElement;
  let codeMode: "interface" | "source" = "interface";
  let diffStyle: "split" | "unified" = "split";
  let showPrivate = false,
    showDocstrings = false;
  let source: {
    before: string | null;
    after: string | null;
    beforeLines?: (number | null)[];
    afterLines?: (number | null)[];
  } | null = null;
  let review: Review | null = null;
  let error = "",
    busy = false;
  let selected: Change | null = null,
    fileId = "",
    filePath = "";
  let before = "",
    after = "";
  let generation = 0;
  async function select(id: string, path: string, change: Change) {
    const current = ++generation;
    selected = change;
    fileId = id;
    filePath = path;
    before = "";
    after = "";
    source = null;
    error = "";
    if (
      view === "functions" ||
      ((view === "graph" || view === "combined") && change.kind !== "function")
    ) {
      busy = false;
      return;
    }
    busy = true;
    try {
      const params = new URLSearchParams();
      if (
        view === "code" &&
        change.kind !== "function" &&
        codeMode === "interface"
      ) {
        params.set("view", "interface");
        params.set("private", showPrivate ? "1" : "0");
        params.set("docstrings", showDocstrings ? "1" : "0");
        if (change.kind === "class") params.set("symbol", change.id);
      }
      const response = await fetch(`/api/source/${id}?${params}`);
      if (!response.ok) throw new Error("Unable to load revision source");
      const loaded = await response.json();
      if (current !== generation) return;
      source = loaded;
      if (view === "code") return;
      const [left, right] = await Promise.all([
        change.before ? graph(loaded.before, change.before, "before") : "",
        change.after ? graph(loaded.after, change.after, "after") : "",
      ]);
      if (current === generation) {
        before = left;
        after = right;
      }
    } catch (e) {
      if (current === generation) error = String(e);
    } finally {
      if (current === generation) busy = false;
    }
  }
  function setView(next: View) {
    view = next;
    if (next === "functions") {
      functionsOpened = true;
      returnToFunctions = false;
    } else {
      singleView = next;
    }
    if (selected) void select(fileId, filePath, selected);
  }
  let coverageMode: "run" | "explore" | "trace" = "run";
  let coverageSelection: { fileId: string; changeId: string } | null = null;
  function inspectCoverage(id: string, changeId: string) {
    tab = "coverage";
    coverageMode = "explore";
    coverageSelection = { fileId: id, changeId };
  }
  function focusFunction(id: string, path: string, change: Change) {
    returnToFunctions = true;
    view = "combined";
    singleView = "combined";
    void select(id, path, change);
    void tick().then(() => backButton?.focus());
  }
  function setCodeMode(next: "interface" | "source") {
    codeMode = next;
    if (selected) void select(fileId, filePath, selected);
  }
  function codeFor(
    text: string | null,
    symbol: SymbolInfo | null,
    projected: boolean,
  ) {
    if (projected || selected?.kind === "module") return text;
    if (!symbol) return null;
    // Include complete source lines, preserving indentation, comments and line endings.
    const start = text!.lastIndexOf("\n", symbol.start - 1) + 1;
    const end = text!.indexOf("\n", symbol.end);
    return text!.slice(start, end === -1 ? text!.length : end + 1);
  }
  function startLine(text: string | null, symbol: SymbolInfo | null) {
    return text && symbol ? text.slice(0, symbol.start).split("\n").length : 1;
  }
  $: interfaceView =
    view === "code" &&
    !!selected &&
    selected.kind !== "function" &&
    codeMode === "interface";
  $: codeBefore =
    source && selected
      ? codeFor(source.before, selected.before, interfaceView)
      : null;
  $: codeAfter =
    source && selected
      ? codeFor(source.after, selected.after, interfaceView)
      : null;
  onMount(async () => {
    try {
      const response = await fetch("/api/review");
      if (!response.ok) throw new Error("Unable to load review");
      review = reviewSchema.parse(await response.json());
      const file = review.files.find((f) =>
        f.changes.some((c) => c.kind === "function"),
      );
      if (file)
        await select(
          file.id,
          file.path,
          file.changes.find((c) => c.kind === "function")!,
        );
    } catch (e) {
      error = String(e);
    }
  });
</script>

<svelte:head><title>Princess · Code review</title></svelte:head>
<header>
  <div>
    <strong>♛ Princess</strong><span class="subtitle"
      >STRUCTURAL CODE REVIEW</span
    >
  </div>
  <nav aria-label="Main navigation">
    <button class:active={tab === "review"} aria-pressed={tab === "review"} onclick={() => tab = "review"}>Review</button>
    <button class:active={tab === "coverage"} aria-pressed={tab === "coverage"} onclick={() => tab = "coverage"}>Tests &amp; coverage{(coverageState?.status === "running" || traceState?.status === "running") ? " · Running…" : ""}</button>
  </nav>
  <span class="revisions"
    >{review
      ? `${review.base.slice(0, 8)} → ${review.head.slice(0, 8)}`
      : "Loading review…"}</span
  >
</header>
<main hidden={tab !== "review"}>
  <aside>
    <div class="section-title">
      CHANGED STRUCTURE <span
        >{review?.files.length ?? 0}
        {review?.files.length === 1 ? "file" : "files"}</span
      >
    </div>
    {#if review}<ReviewTree {review} {fileId} selectedId={selected?.id ?? ""} onselect={select} />{/if}
    <footer>
      A added &nbsp; D removed &nbsp; M modified &nbsp; R renamed<br />Summary contains
      structure, not code.
    </footer>
  </aside>
  <article>
    <div class="toolbar">
      <div>
        <div class="breadcrumb">
          {view === "functions"
            ? "All changed files"
            : filePath || "Select a changed function"}
        </div>
        <h1>
          {view === "functions"
            ? "All function graphs"
            : selected
              ? ((selected.after ?? selected.before)?.id ?? selected.name)
              : "Review overview"}
        </h1>
      </div>
      <div class="view-controls">
        <div class="scope-controls">
          {#if returnToFunctions && view !== "functions"}
            <button
              class="back-functions"
              bind:this={backButton}
              onclick={() => setView("functions")}
              >← Back to all function graphs</button
            >
          {/if}
          <div class="view-toggle" role="group" aria-label="Review scope">
            <button
              class:active={view !== "functions"}
              aria-pressed={view !== "functions"}
              onclick={() => setView(singleView)}>Single function</button
            >
            <button
              class:active={view === "functions"}
              aria-pressed={view === "functions"}
              onclick={() => setView("functions")}>All functions</button
            >
          </div>
        </div>
        {#if view !== "functions"}
          <div class="single-controls">
            <div
              class="view-toggle"
              role="group"
              aria-label="Single function view"
            >
              <button
                class:active={view === "graph"}
                aria-pressed={view === "graph"}
                onclick={() => setView("graph")}>Graph</button
              >
              <button
                class:active={view === "code"}
                aria-pressed={view === "code"}
                onclick={() => setView("code")}>Code diff</button
              >
              <button
                class:active={view === "combined"}
                aria-pressed={view === "combined"}
                onclick={() => setView("combined")}>Code + graph</button
              >
            </div>
            {#if view === "code" || view === "combined"}
              <div class="view-toggle" role="group" aria-label="Diff layout">
                <button
                  class:active={diffStyle === "split"}
                  aria-pressed={diffStyle === "split"}
                  onclick={() => (diffStyle = "split")}>Side-by-side</button
                >
                <button
                  class:active={diffStyle === "unified"}
                  aria-pressed={diffStyle === "unified"}
                  onclick={() => (diffStyle = "unified")}>Inline</button
                >
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    {#if view === "code" && selected && selected.kind !== "function"}
      <div class="interface-controls">
        <div class="view-toggle" role="group" aria-label="Code representation">
          <button
            class:active={codeMode === "interface"}
            aria-pressed={codeMode === "interface"}
            onclick={() => setCodeMode("interface")}>Interface</button
          >
          <button
            class:active={codeMode === "source"}
            aria-pressed={codeMode === "source"}
            onclick={() => setCodeMode("source")}>Full source</button
          >
        </div>
        {#if codeMode === "interface"}
          <label
            ><input
              type="checkbox"
              bind:checked={showPrivate}
              onchange={() => selected && select(fileId, filePath, selected)}
            /> Show private members</label
          >
          <label
            ><input
              type="checkbox"
              bind:checked={showDocstrings}
              onchange={() => selected && select(fileId, filePath, selected)}
            /> Show docstrings</label
          >
        {/if}
      </div>
    {/if}
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <div class="detail-content" class:combined={view === "combined"}>
      {#if functionsOpened && review}
        <div class="function-overview" hidden={view !== "functions"}>
          <FunctionGraphs
            {review}
            active={view === "functions"}
            onfocus={focusFunction}
          />
        </div>
      {/if}
      {#if (view === "code" || (view === "combined" && selected?.kind === "function")) && selected}
        <div
          class="diff-revisions"
          class:one-sided={diffStyle === "unified" ||
            (source && (codeBefore === null || codeAfter === null))}
        >
          {#if source && codeBefore === null}
            <span
              >After · {review?.head.slice(0, 8)} · Added {selected.kind} — no previous
              version</span
            >
          {:else if source && codeAfter === null}
            <span
              >Before · {review?.base.slice(0, 8)} · Removed {selected.kind} — no
              next version</span
            >
          {:else if diffStyle === "unified"}
            <span
              >Before · {review?.base.slice(0, 8)} → After · {review?.head.slice(
                0,
                8,
              )}</span
            >
          {:else}
            <span>Before · {review?.base.slice(0, 8)}</span>
            <span>After · {review?.head.slice(0, 8)}</span>
          {/if}
        </div>
        {#if busy}<div class="empty">Loading code diff…</div>
        {:else if source}
          {#if interfaceView && codeBefore !== null && codeAfter !== null && codeBefore === codeAfter}
            <div class="notice" role="status">
              No visible interface differences with these filters. Full source
              may still contain implementation or filtered changes.
            </div>
          {/if}
          {#key `${generation}-${diffStyle}`}
            <CodeDiff
              before={codeBefore}
              after={codeAfter}
              wrap={interfaceView}
              {diffStyle}
              beforeLines={interfaceView ? source.beforeLines : undefined}
              afterLines={interfaceView ? source.afterLines : undefined}
              beforeStart={selected.kind === "module"
                ? 1
                : startLine(source.before, selected.before)}
              afterStart={selected.kind === "module"
                ? 1
                : startLine(source.after, selected.after)}
              oldPath={review!.files.find((file) => file.id === fileId)!
                .oldPath}
              path={filePath}
            />
          {/key}
          <div class="hint">
            {interfaceView
              ? "Generated interface · bodies and initializers omitted · original source line numbers"
              : selected.kind === "module"
                ? "Whole module · original file line numbers"
                : `${selected.kind === "class" ? "Class" : "Function"} only, including decorators · original file line numbers`}
          </div>
        {/if}
      {/if}
      {#if (view === "graph" || view === "combined") && selected?.kind === "function"}
        <div class="panes">
          {#each [{ title: "Before", revision: review?.base, svg: before, symbol: selected.before }, { title: "After", revision: review?.head, svg: after, symbol: selected.after }] as pane}
            <section class="pane">
              <div class="pane-title">
                <strong>{pane.title}</strong><span
                  >{pane.revision?.slice(0, 8)}{pane.symbol
                    ? ` · line ${pane.symbol.line}`
                    : ""}</span
                >
              </div>
              {#if pane.symbol}
                <pre
                  class="signature"
                  aria-label={`${pane.title} function signature`}><code
                    >{pane.symbol.signature}</code
                  ></pre>
              {/if}
              <div class="graph-area">
                {#if busy}<div class="empty">Generating function graph…</div>
                {:else if pane.svg}{#key pane.svg}<GraphPane
                      svg={pane.svg}
                    />{/key}
                {:else}<div class="empty">
                    {pane.symbol
                      ? "Graph unavailable"
                      : `Function ${pane.title === "Before" ? "added — no previous version" : "removed — no next version"}`}
                  </div>{/if}
              </div>
            </section>
          {/each}
        </div>
        <div class="hint">
          Scroll to zoom · drag to pan · independent control-flow graphs, not a
          graph diff
        </div>
      {:else if view !== "functions" && (view !== "code" || !selected)}<div
          class="welcome"
        >
          <div class="emblem">♛</div>
          <h2>
            {selected?.kind === "class"
              ? "Class structure changed"
              : selected?.kind === "module"
                ? "Module-level changes"
                : "Explore the shape of a change"}
          </h2>
          <p>
            {selected?.kind === "class"
              ? "Select a changed method to compare its code and function graphs."
              : selected?.kind === "module"
                ? "No function graph applies to a whole module. Switch to Code diff to review its source."
                : "Select a function in the structure tree to compare its before and after control flow."}
          </p>
        </div>{/if}
    </div>
  </article>
</main>
<div class="coverage-page" hidden={tab !== "coverage"}>
  <div class="coverage-tabs" role="group" aria-label="Coverage workspace">
    <button class:active={coverageMode === "run"} aria-pressed={coverageMode === "run"} onclick={() => coverageMode = "run"}>Run tests</button>
    <button class:active={coverageMode === "explore"} aria-pressed={coverageMode === "explore"} onclick={() => coverageMode = "explore"}>Explore coverage</button>
    <button class:active={coverageMode === "trace"} aria-pressed={coverageMode === "trace"} onclick={() => coverageMode = "trace"}>Function traces</button>
  </div>
  <div class="coverage-run" hidden={coverageMode !== "run"}>
    <h1>Run tests with coverage</h1>
    <p>Choose changed tests, then explore their associations with changed functions.</p>
    {#if review}<CoveragePanel {review} {fileId} selectedId={selected?.id ?? ""} bind:state={coverageState} oninspect={inspectCoverage} />{/if}
  </div>
  {#if review}<div class="coverage-explore" hidden={coverageMode !== "trace"}><TraceView {review} bind:state={traceState} /></div>{/if}
  {#if review}<div class="coverage-explore" hidden={coverageMode !== "explore"}><CoverageExplorer {review} state={coverageState} initialSelection={coverageSelection} /></div>{/if}
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    color: #243447;
    background: #f4f6f9;
  }
  :global(button),
  :global(input) {
    font: inherit;
  }
  header {
    height: 72px;
    background: #142336;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
  }
  main[hidden], .coverage-page[hidden], .coverage-run[hidden], .coverage-explore[hidden] { display: none; }
  .coverage-page { display: flex; flex-direction: column; height: calc(100vh - 72px); }
  .coverage-tabs { display: flex; gap: 8px; padding: 12px 28px; border-bottom: 1px solid #dce3eb; background: white; }
  .coverage-tabs button { width: auto; padding: 8px 16px; border-radius: 5px; font-size: 13px; }
  .coverage-tabs button.active { box-shadow: none; }
  .coverage-run { padding: 28px; overflow: auto; }
  .coverage-run > p { color: #63758a; font-size: 13px; }
  .coverage-explore { flex: 1; min-height: 0; }
  header nav { display: flex; gap: 8px; }
  header nav button { width: auto; color: #c3cddb; border-radius: 6px; padding: 10px 16px; font-size: 13px; }
  header nav button.active, header nav button:hover { color: white; background: #2c405a; box-shadow: none; }
  header strong {
    font-size: 24px;
    letter-spacing: -0.5px;
  }
  .subtitle {
    margin-left: 24px;
    font-size: 10px;
    letter-spacing: 2px;
    color: #9eadbf;
  }
  .revisions {
    font-family: monospace;
    font-size: 13px;
    color: #c3cddb;
  }
  main {
    display: grid;
    grid-template-columns: 310px minmax(0, 1fr);
    height: calc(100vh - 72px);
  }
  aside {
    background: #fff;
    border-right: 1px solid #dce3eb;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .section-title {
    padding: 24px 18px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #63758a;
  }
  .section-title span {
    float: right;
    letter-spacing: 0;
    font-weight: 400;
  }
  button {
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 11px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 9px;
    color: #42526a;
  }
  button:hover {
    background: #f1f5fc;
  }
  button.active {
    background: #e9efff;
    color: #3455aa;
    box-shadow: inset 3px 0 #5374d6;
  }
  footer {
    margin-top: auto;
    padding: 20px;
    font-size: 11px;
    color: #8b98a8;
    line-height: 2;
    border-top: 1px solid #edf0f4;
  }
  article {
    padding: 26px;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .toolbar > div:first-child {
    flex-shrink: 0;
    max-width: 100%;
  }
  .detail-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .function-overview {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .function-overview[hidden] {
    display: none;
  }
  .back-functions {
    width: auto;
    padding: 8px 12px;
    font-size: 12px;
    color: #3455aa;
  }
  .detail-content.combined {
    overflow: auto;
    gap: 16px;
  }
  .combined :global(.code-diff) {
    flex: none;
    min-height: 120px;
    overflow: visible;
  }
  .combined .panes {
    flex: none;
    height: 500px;
  }
  .view-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-end;
  }
  .scope-controls,
  .single-controls {
    display: flex;
    gap: 14px;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .interface-controls {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .notice {
    padding: 12px 16px;
    margin-bottom: 12px;
    border-radius: 6px;
    background: #e9efff;
    color: #3455aa;
    font-size: 12px;
  }
  .view-toggle {
    display: flex;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .view-toggle button {
    width: auto;
    padding: 8px 12px;
    white-space: nowrap;
    font-size: 12px;
  }
  .view-toggle button.active {
    box-shadow: none;
  }
  .diff-revisions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0 18px 12px;
    font:
      12px ui-monospace,
      monospace;
    color: #667991;
  }
  .diff-revisions.one-sided {
    grid-template-columns: 1fr;
  }
  .breadcrumb {
    color: #7b8b9f;
    font-size: 12px;
  }
  h1 {
    font-size: 23px;
    margin: 5px 0 0;
    letter-spacing: -0.6px;
    overflow-wrap: anywhere;
  }
  label {
    font-size: 12px;
    color: #667991;
    white-space: nowrap;
  }
  input {
    accent-color: #5374d6;
  }
  .panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    flex: 1;
    min-height: 0;
  }
  .pane {
    background: white;
    border: 1px solid #dce3eb;
    border-radius: 9px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 3px 12px #14233605;
  }
  .pane-title {
    padding: 16px 18px;
    border-bottom: 1px solid #e9edf2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .pane-title span {
    font-family: monospace;
    color: #8a98aa;
    font-size: 11px;
  }
  .signature {
    margin: 0;
    padding: 14px 18px;
    max-height: 180px;
    flex-shrink: 0;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font:
      12px/1.6 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    color: #42526a;
    background: #f7f9fc;
    border-bottom: 1px solid #e9edf2;
  }
  .graph-area {
    flex: 1;
    min-height: 0;
    padding: 18px;
  }
  .empty {
    height: 100%;
    display: grid;
    place-items: center;
    color: #8a98aa;
    font-size: 13px;
    text-align: center;
  }
  .hint {
    text-align: center;
    font-size: 11px;
    color: #8998aa;
    padding-top: 16px;
  }
  .error {
    background: #fff0f1;
    color: #a33340;
    padding: 16px;
    margin-bottom: 16px;
    border-radius: 8px;
  }
  .welcome {
    margin: auto;
    max-width: 440px;
    text-align: center;
    color: #77879b;
  }
  .welcome h2 {
    color: #42546b;
    font-size: 20px;
  }
  .welcome p {
    line-height: 1.7;
    font-size: 14px;
  }
  .emblem {
    font-size: 54px;
    color: #b5c2d8;
  }
  @media (max-width: 850px) {
    main {
      grid-template-columns: 230px minmax(0, 1fr);
    }
    .subtitle {
      display: none;
    }
    article {
      padding: 14px;
    }
    .panes {
      grid-template-columns: 1fr;
      overflow: auto;
    }
    .pane {
      min-height: 350px;
    }
    .toolbar {
      flex-wrap: wrap;
    }
  }
</style>
