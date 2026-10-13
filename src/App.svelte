<script lang="ts">
  import { onMount } from "svelte";
  import {
    reviewSchema,
    type Review,
    type Change,
    type SymbolInfo,
  } from "./model";
  import { graph } from "./graphs";
  import GraphPane from "./GraphPane.svelte";
  import CodeDiff from "./CodeDiff.svelte";
  let view: "graph" | "code" = "graph";
  let codeMode: "interface" | "source" = "interface";
  let diffStyle: "split" | "unified" = "split";
  let showPrivate = false,
    showDocstrings = false;
  let source: { before: string | null; after: string | null } | null = null;
  let review: Review | null = null;
  let error = "",
    busy = false,
    detailed = false;
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
    if (view === "graph" && change.kind !== "function") {
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
        change.before
          ? graph(loaded.before, change.before, "before", detailed)
          : "",
        change.after
          ? graph(loaded.after, change.after, "after", detailed)
          : "",
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
  function setView(next: "graph" | "code") {
    view = next;
    if (selected) void select(fileId, filePath, selected);
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
  <span class="revisions"
    >{review
      ? `${review.base.slice(0, 8)} → ${review.head.slice(0, 8)}`
      : "Loading review…"}</span
  >
</header>
<main>
  <aside>
    <div class="section-title">
      CHANGED STRUCTURE <span
        >{review?.files.length ?? 0}
        {review?.files.length === 1 ? "file" : "files"}</span
      >
    </div>
    {#each review?.files ?? [] as file}
      <section class="file">
        <h2
          title={file.oldPath !== file.path
            ? `Renamed from ${file.oldPath}`
            : file.path}
        >
          <span>◇</span>
          {#if file.supported}
            <button
              class="file-select"
              class:active={selected?.kind === "module" && fileId === file.id}
              aria-label={`View module ${file.path}`}
              onclick={() =>
                select(file.id, file.path, {
                  id: "$module",
                  name: file.path,
                  kind: "module",
                  parent: null,
                  status:
                    file.status === "A"
                      ? "added"
                      : file.status === "D"
                        ? "removed"
                        : "modified",
                  before: null,
                  after: null,
                })}>{file.path}</button
            >
          {:else}{file.path}{/if}
          <small>{file.status.startsWith("R") ? "renamed" : file.status}</small>
        </h2>
        {#if !file.supported}<p class="muted">
            Non-Python file · file change only
          </p>{/if}
        {#each file.changes as change}
          <button
            class:active={selected?.id === change.id && fileId === file.id}
            style:padding-left={`${14 + (change.parent?.split(".").length ?? 0) * 16}px`}
            onclick={() => select(file.id, file.path, change)}
          >
            <span class="kind"
              >{change.kind === "class"
                ? "C"
                : change.kind === "function"
                  ? "ƒ"
                  : "·"}</span
            ><span class="name">{change.name}</span><span
              class={`status ${change.status}`}
              >{change.status === "added"
                ? "+"
                : change.status === "removed"
                  ? "−"
                  : "~"}</span
            >
          </button>
        {/each}
        {#if file.supported && !file.changes.length}<p class="muted">
            No definition changes
          </p>{/if}
      </section>
    {/each}
    {#if review && !review.files.length}<p class="muted">
        No changes between these commits.
      </p>{/if}
    <footer>
      + added &nbsp; − removed &nbsp; ~ modified<br />Summary contains
      structure, not code.
    </footer>
  </aside>
  <article>
    <div class="toolbar">
      <div>
        <div class="breadcrumb">{filePath || "Select a changed function"}</div>
        <h1>
          {selected
            ? ((selected.after ?? selected.before)?.id ?? selected.name)
            : "Review overview"}
        </h1>
      </div>
      <div class="view-controls">
        <div class="view-toggle" role="group" aria-label="Review view">
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
        </div>
        {#if view === "code"}
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
        {#if view === "graph"}<label
            ><input
              type="checkbox"
              bind:checked={detailed}
              onchange={() => selected && select(fileId, filePath, selected)}
            /> Detailed labels</label
          >{/if}
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
    {#if view === "code" && selected}
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
            >Before · {review?.base.slice(0, 8)} · Removed {selected.kind} — no next
            version</span
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
            No visible interface differences with these filters. Full source may
            still contain implementation or filtered changes.
          </div>
        {/if}
        {#key `${generation}-${diffStyle}`}
          <CodeDiff
            before={codeBefore}
            after={codeAfter}
            wrap={interfaceView}
            {diffStyle}
            oldPath={review!.files.find((file) => file.id === fileId)!.oldPath}
            path={filePath}
          />
        {/key}
        <div class="hint">
          {interfaceView
            ? "Generated interface · bodies and initializers omitted · generated line numbers, not source locations"
            : selected.kind === "module"
              ? "Whole module · original file line numbers"
              : `${selected.kind === "class" ? "Class" : "Function"} only, including decorators · line numbers relative to this snippet`}
        </div>
      {/if}
    {:else if selected?.kind === "function"}
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
    {:else}<div class="welcome">
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
            ? "Select a changed method to compare its function graphs."
            : selected?.kind === "module"
              ? "No function graph applies to a whole module. Switch to Code diff to review its source."
              : "Select a function in the structure tree to compare its before and after control flow."}
        </p>
      </div>{/if}
  </article>
</main>

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
    overflow: auto;
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
  .file {
    padding-bottom: 16px;
  }
  .file h2 {
    font-size: 13px;
    font-weight: 650;
    margin: 0;
    padding: 10px 14px;
    overflow-wrap: anywhere;
    background: #f7f9fc;
  }
  .file h2 span {
    color: #73869b;
  }
  .file-select {
    display: inline;
    width: auto;
    padding: 2px 4px;
    font-weight: inherit;
    overflow-wrap: anywhere;
  }
  small {
    font-size: 10px;
    color: #778698;
    margin-left: 5px;
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
  .kind {
    color: #798ba3;
    width: 15px;
    font-family: monospace;
  }
  .name {
    overflow-wrap: anywhere;
    flex: 1;
    font-size: 13px;
  }
  .status {
    font-family: monospace;
    font-size: 16px;
  }
  .added {
    color: #258459;
  }
  .removed {
    color: #c2525a;
  }
  .modified {
    color: #b77e24;
  }
  footer {
    margin-top: auto;
    padding: 20px;
    font-size: 11px;
    color: #8b98a8;
    line-height: 2;
    border-top: 1px solid #edf0f4;
  }
  .muted {
    font-size: 12px;
    color: #8b98a8;
    padding: 0 18px;
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
  }
  .view-controls {
    display: flex;
    gap: 14px;
    align-items: center;
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
