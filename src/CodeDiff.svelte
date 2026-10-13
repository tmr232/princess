<script lang="ts">
  import { onMount } from "svelte";
  import { FileDiff, type FileContents } from "@pierre/diffs";

  export let before: string | null;
  export let after: string | null;
  export let oldPath: string;
  export let path: string;
  let root: HTMLDivElement;

  onMount(() => {
    const viewer = new FileDiff({
      diffStyle: "split",
      themeType: "light",
      expandUnchanged: true,
      disableFileHeader: true,
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

<div class="code-diff" bind:this={root}></div>

<style>
  .code-diff {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: white;
    border: 1px solid #dce3eb;
    border-radius: 9px;
  }
</style>
