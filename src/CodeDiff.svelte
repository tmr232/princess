<script lang="ts">
  import { onMount } from "svelte";
  import { File, FileDiff, type FileContents } from "@pierre/diffs";

  export let before: string | null;
  export let after: string | null;
  export let oldPath: string;
  export let path: string;
  export let wrap = false;
  export let diffStyle: "split" | "unified" = "split";
  export let beforeLines: (number | null)[] | undefined = undefined;
  export let afterLines: (number | null)[] | undefined = undefined;
  export let beforeStart = 1;
  export let afterStart = 1;
  let root: HTMLDivElement;
  let oldRoot: HTMLDivElement, newRoot: HTMLDivElement;

  function numberGutters(node: HTMLElement, side?: "before" | "after") {
    const dom = node.shadowRoot ?? node;
    dom
      .querySelectorAll<HTMLElement>("[data-column-number]")
      .forEach((gutter) => {
        const content = gutter.querySelector("[data-line-number-content]");
        if (!content) return;
        const old = side
          ? side === "before"
          : gutter.closest("[data-deletions]") !== null ||
            gutter.dataset.lineType === "change-deletion" ||
            after === null;
        const index = Number(gutter.dataset.columnNumber) - 1;
        const lines = old ? beforeLines : afterLines;
        const number = lines
          ? lines[index]
          : index + (old ? beforeStart : afterStart);
        content.textContent = number == null ? "" : String(number);
      });
  }

  onMount(() => {
    // FileDiff has no hunks for identical text; keep both revisions readable.
    if (before !== null && before === after) {
      const containers = diffStyle === "split" ? [oldRoot, newRoot] : [oldRoot];
      const viewers = containers.map((containerWrapper, i) => {
        const viewer = new File({
          themeType: "light",
          disableFileHeader: true,
          overflow: wrap ? "wrap" : "scroll",
          onPostRender: (node) => numberGutters(node, i ? "after" : "before"),
        });
        viewer.render({
          file: { name: i ? path : oldPath, contents: before!, lang: "python" },
          containerWrapper,
        });
        return viewer;
      });
      return () => viewers.forEach((viewer) => viewer.cleanUp());
    }
    const viewer = new FileDiff({
      diffStyle,
      themeType: "light",
      expandUnchanged: true,
      disableFileHeader: true,
      overflow: wrap ? "wrap" : "scroll",
      onPostRender: (node) => numberGutters(node),
    });
    const oldFile: FileContents | null =
      before === null
        ? null
        : { name: oldPath, contents: before, lang: "python" };
    const newFile: FileContents | null =
      after === null ? null : { name: path, contents: after, lang: "python" };
    viewer.render({
      ...(oldFile === null
        ? { oldFile: null, newFile: newFile! }
        : newFile === null
          ? { oldFile, newFile: null }
          : { oldFile, newFile }),
      containerWrapper: root,
    });
    return () => viewer.cleanUp();
  });
</script>

<div
  class="code-diff"
  class:identical={before !== null && before === after && diffStyle === "split"}
  bind:this={root}
>
  {#if before !== null && before === after}
    <div class="unchanged-file" bind:this={oldRoot}></div>
    {#if diffStyle === "split"}
      <div class="unchanged-file" bind:this={newRoot}></div>
    {/if}
  {/if}
</div>

<style>
  .code-diff {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: white;
    border: 1px solid #dce3eb;
    border-radius: 9px;
  }
  .identical {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-content: start;
  }
  .unchanged-file {
    min-width: 0;
  }
  .unchanged-file + .unchanged-file {
    border-left: 1px solid #dce3eb;
  }
</style>
