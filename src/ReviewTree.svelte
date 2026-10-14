<script lang="ts">
  import { onMount } from "svelte";
  import { FileTree } from "@pierre/trees";
  import type { Review, Change } from "./model";
  import { reviewTree } from "./reviewTree";
  export let review: Review;
  export let fileId: string;
  export let selectedId: string;
  export let onselect: (id: string, path: string, change: Change) => unknown;
  let root: HTMLDivElement;
  let tree: FileTree | undefined;
  let synchronizing = false;
  let query = "";
  let note = "";
  $: data = reviewTree(review);
  const normalize = (path: string) => path.replace(/\/$/, "");
  $: if (tree) syncSelection(fileId, selectedId);
  function syncSelection(id: string, changeId: string) {
    if (!tree) return;
    const current = tree.getSelectedPaths().find(path => data.rows.get(normalize(path))?.fileId === id && data.rows.get(normalize(path))?.change?.id === changeId);
    if (current) return;
    const path = [...data.rows].find(([, row]) => row.fileId === id && row.change?.id === changeId)?.[0];
    if (!path) return;
    synchronizing = true;
    try {
      for (const selected of tree.getSelectedPaths()) tree.getItem(selected)?.deselect();
      tree.getItem(path)?.select(); tree.scrollToPath(path, { focus: false });
    } finally { synchronizing = false; }
  }
  function directoryPaths() {
    return [...new Set(data.paths.flatMap(path => {
      const parts = path.split("/"); return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/") + "/");
    }))];
  }
  function expand(open: boolean) {
    if (!tree) return;
    synchronizing = true;
    try { tree.resetPaths(data.paths, { initialExpandedPaths: open ? directoryPaths() : [] }); tree.setGitStatus(data.statuses); }
    finally { synchronizing = false; }
  }
  onMount(() => {
    tree = new FileTree({ paths: data.paths, gitStatus: data.statuses,
      initialExpansion: "closed", initialExpandedPaths: directoryPaths(), flattenEmptyDirectories: true, stickyFolders: true,
      search: false, fileTreeSearchMode: "hide-non-matches", searchBlurBehavior: "retain",
      density: "default", icons: "minimal", overscan: 8,
      renderRowDecoration: ({ row }) => {
        const entry = data.rows.get(normalize(row.path));
        return entry ? { text: "", title: entry.title } : null;
      },
      onSelectionChange: paths => {
        if (synchronizing || !tree) return;
        const focused = tree.getFocusedPath();
        const path = focused && paths.includes(focused) ? focused : paths.at(-1);
        const row = path && data.rows.get(normalize(path));
        if (!row) return;
        note = !row.change || row.title.includes("renamed from") || row.title.includes("No definition changes") ? row.title : "";
        if (!row.change) { syncSelection(fileId, selectedId); return; }
        onselect(row.fileId, row.filePath, row.change);
      },
    });
    tree.render({ containerWrapper: root });
    syncSelection(fileId, selectedId);
    return () => tree?.cleanUp();
  });
</script>

<div class="navigation">
  <label><span class="sr-only">Search changed structure</span><input type="search" placeholder="Search files and functions…" aria-label="Search changed structure" bind:value={query} oninput={(event) => tree?.setSearch(event.currentTarget.value || null)} /></label>
  <div class="actions"><button onclick={() => expand(true)}>Expand all</button><button onclick={() => expand(false)}>Collapse all</button></div>
  <div class="mount" aria-label="Changed structure tree" bind:this={root}></div>
  {#if note}<p class="note" role="status">{note}</p>{/if}
  {#if !review.files.length}<p>No changes between these commits.</p>{/if}
</div>
<style>
  .navigation { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  label { padding: 0 14px; } input { font: inherit; font-size: 12px; width: 100%; padding: 9px 10px; border: 1px solid #dce3eb; border-radius: 5px; color: #42526a; }
  .actions { display: flex; gap: 8px; padding: 8px 14px 12px; } button { font: inherit; font-size: 11px; padding: 5px 8px; border: 0; border-radius: 4px; background: #f1f5fc; color: #63758a; cursor: pointer; }
  .mount { flex: 1; min-height: 0; position: relative; --trees-selected-bg-override: #e9efff; --trees-fg-override: #42526a; --trees-border-color-override: #dce3eb; }
  p { font-size: 12px; color: #7b8b9f; padding: 14px; } .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
