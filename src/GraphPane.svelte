<script lang="ts">
  import { onMount } from "svelte";
  import Panzoom from "@panzoom/panzoom";
  export let svg = "";
  let root: HTMLDivElement;
  onMount(() => {
    const zoom = Panzoom(root, { maxScale: 8, minScale: 0.2 });
    const wheel = (event: WheelEvent) => zoom.zoomWithWheel(event);
    root.parentElement!.addEventListener("wheel", wheel, { passive: false });
    return () => {
      root.parentElement!.removeEventListener("wheel", wheel);
      zoom.destroy();
    };
  });
</script>

<div class="viewport">
  <div class="canvas" bind:this={root}>{@html svg}</div>
</div>

<style>
  .viewport {
    height: 100%;
    overflow: hidden;
    background: #fff;
  }
  .canvas {
    width: 100%;
    height: 100%;
  }
  .canvas :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
