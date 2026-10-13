<script lang="ts">
  import { onMount, tick } from "svelte";
  import { graph } from "./graphs";
  import type { Review, Change } from "./model";
  export let review: Review;
  export let active = true;
  export let onfocus: (fileId: string, path: string, change: Change) => void;
  let focusedButton: HTMLButtonElement | null = null;
  $: if (active && focusedButton) {
    void tick().then(() => focusedButton?.focus({ preventScroll: true }));
  }
  let pairs: {
    fileId: string;
    path: string;
    change: Change;
    before: string;
    after: string;
    height: number;
    error: string;
  }[] = [];
  let loading = true;
  onMount(() => {
    let cancelled = false;
    async function load() {
      for (const file of review.files) {
        const functions = file.changes.filter(
          (change) => change.kind === "function",
        );
        if (!functions.length) continue;
        let source;
        try {
          const response = await fetch(`/api/source/${file.id}`);
          if (!response.ok) throw new Error("Unable to load revision source");
          source = await response.json();
        } catch (error) {
          if (!cancelled)
            pairs = [
              ...pairs,
              ...functions.map((change) => ({
                fileId: file.id,
                path: file.path,
                change,
                before: "",
                after: "",
                height: 240,
                error: String(error),
              })),
            ];
          continue;
        }
        for (const change of functions) {
          if (cancelled) return;
          try {
            const svgs = await Promise.all([
              change.before
                ? graph(
                    source.before,
                    change.before,
                    `${file.id}-${change.id}-before`,
                  )
                : "",
              change.after
                ? graph(
                    source.after,
                    change.after,
                    `${file.id}-${change.id}-after`,
                  )
                : "",
            ]);
            // A shared viewBox gives both sides the same scale and top alignment.
            const docs = svgs.map((svg) =>
              svg
                ? new DOMParser().parseFromString(svg, "image/svg+xml")
                : null,
            );
            const boxes = docs.map((doc) =>
              doc?.documentElement
                .getAttribute("viewBox")!
                .split(/\s+/)
                .map(Number),
            );
            const width = Math.max(...boxes.map((box) => box?.[2] ?? 0));
            const height = Math.max(...boxes.map((box) => box?.[3] ?? 0));
            const aligned = docs.map((doc) => {
              if (!doc) return "";
              const box = doc.documentElement
                .getAttribute("viewBox")!
                .split(/\s+/);
              doc.documentElement.setAttribute(
                "viewBox",
                `${box[0]} ${box[1]} ${width} ${height}`,
              );
              doc.documentElement.setAttribute(
                "preserveAspectRatio",
                "xMidYMin meet",
              );
              return new XMLSerializer().serializeToString(doc.documentElement);
            });
            if (!cancelled)
              pairs = [
                ...pairs,
                {
                  fileId: file.id,
                  path: file.path,
                  change,
                  before: aligned[0]!,
                  after: aligned[1]!,
                  height: Math.max(240, height),
                  error: "",
                },
              ];
          } catch (error) {
            if (!cancelled)
              pairs = [
                ...pairs,
                {
                  fileId: file.id,
                  path: file.path,
                  change,
                  before: "",
                  after: "",
                  height: 240,
                  error: String(error),
                },
              ];
          }
          await new Promise(requestAnimationFrame);
        }
      }
      if (!cancelled) loading = false;
    }
    void load();
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="function-list">
  {#each pairs as pair}
    <section
      class="function-pair"
      aria-label={`${pair.path} · ${(pair.change.after ?? pair.change.before)?.id}`}
    >
      <div class="pair-header">
        <h2>
          {pair.path} · {(pair.change.after ?? pair.change.before)?.id}
          <small>{pair.change.status}</small>
        </h2>
        <button
          class="focus-function"
          aria-label={`Focus function ${pair.path} · ${(pair.change.after ?? pair.change.before)?.id}`}
          onclick={(event) => {
            focusedButton = event.currentTarget;
            onfocus(pair.fileId, pair.path, pair.change);
          }}>Focus function →</button
        >
      </div>
      {#if pair.error}<p role="alert">{pair.error}</p>{:else}
        <div class="pair">
          {#each [{ title: "Before", svg: pair.before, symbol: pair.change.before }, { title: "After", svg: pair.after, symbol: pair.change.after }] as pane}
            <div>
              <h3>
                {pane.title}{pane.symbol ? ` · line ${pane.symbol.line}` : ""}
              </h3>
              <div class="graph" style:height={`${pair.height}px`}>
                {#if pane.svg}{@html pane.svg}{:else}<p>
                    {pane.title === "Before"
                      ? "Added — no previous version"
                      : "Removed — no next version"}
                  </p>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
  {#if loading}<p>Generating function graphs…</p>{:else if !pairs.length}<p>
      No changed functions.
    </p>{/if}
</div>

<style>
  .function-list {
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
  .function-pair {
    background: white;
    border: 1px solid #dce3eb;
    border-radius: 9px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .pair-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px 18px;
    background: #f7f9fc;
  }
  .focus-function {
    width: auto;
    padding: 8px 12px;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    color: #3455aa;
    background: white;
    font-size: 12px;
    white-space: nowrap;
  }
  .focus-function:hover {
    background: #e9efff;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  small {
    font-weight: normal;
    color: #667991;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .pair > div + div {
    border-left: 1px solid #dce3eb;
  }
  h3 {
    font-size: 12px;
    margin: 0;
    padding: 14px 18px;
    border-bottom: 1px solid #e9edf2;
  }
  .graph {
    padding: 18px;
  }
  .graph :global(svg) {
    width: 100%;
    height: 100%;
  }
  p {
    padding: 18px;
    color: #667991;
    text-align: center;
  }
</style>
