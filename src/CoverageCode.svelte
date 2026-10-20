<script lang="ts">
  import { onMount } from "svelte";
  import { File } from "@pierre/diffs";
  import { lineCoverage, type FileCoverage } from "./codeCoverage";
  import type { SymbolInfo } from "./model";
  export let source: string;
  export let symbol: SymbolInfo;
  export let path: string;
  export let coverage: FileCoverage | undefined;
  export let test = "";
  let root: HTMLDivElement;
  let rendered: HTMLElement | undefined;
  let selectedLine: number | null = null;
  const colors = { covered: ["#e1f5eb", "#258459"], uncovered: ["#ffe8eb", "#c2525a"], outside: ["#eef1f5", "#8b98a8"] };
  $: start = source.lastIndexOf("\n", symbol.start - 1) + 1;
  $: end = source.indexOf("\n", symbol.end);
  $: contents = source.slice(start, end === -1 ? source.length : end + 1);
  $: startLine = source.slice(0, start).split("\n").length;
  $: info = coverage && selectedLine !== null ? lineCoverage(coverage, selectedLine, test) : null;
  $: { coverage; test; if (rendered) decorate(rendered); }
  function label(line: number) {
    const info = coverage ? lineCoverage(coverage, line, test) : null;
    if (!info) return "";
    if (info.status === "outside") return "Executed outside test calls";
    if (info.status === "covered") return test ? "Covered by selected test" : `Covered by ${info.tests.length} test${info.tests.length === 1 ? "" : "s"}`;
    return test ? "Not covered by selected test" : "Not executed";
  }
  function decorate(node: HTMLElement) {
    const dom = node.shadowRoot ?? node;
    dom.querySelectorAll<HTMLElement>("[data-column-number], [data-content] > [data-line]").forEach(element => {
      const line = Number(element.dataset.columnNumber ?? element.dataset.line) + startLine - 1;
      const gutter = element.querySelector("[data-line-number-content]");
      if (gutter) gutter.textContent = String(line);
      element.style.removeProperty("background-color"); element.style.removeProperty("box-shadow");
      element.removeAttribute("data-coverage"); element.removeAttribute("data-coverage-line");
      element.removeAttribute("title"); element.removeAttribute("aria-label");
      element.removeAttribute("tabindex"); element.removeAttribute("role");
      element.onclick = null; element.onkeydown = null;
      const info = coverage ? lineCoverage(coverage, line, test) : null;
      if (!info) return;
      element.dataset.coverage = info.status; element.dataset.coverageLine = String(line);
      element.style.setProperty("background-color", colors[info.status][0]!, "important");
      element.style.setProperty("box-shadow", `inset 3px 0 ${colors[info.status][1]}`);
      element.title = `${label(line)}${info.tests.length ? `: ${info.tests.join(", ")}` : ""}`;
      element.setAttribute("aria-label", `Line ${line}: ${element.title}`);
      element.onclick = () => selectedLine = line;
      if (element.dataset.columnNumber) {
        element.tabIndex = 0; element.setAttribute("role", "button");
        element.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedLine = line; } };
      }
    });
  }
  onMount(() => {
    const viewer = new File({ themeType: "light", disableFileHeader: true, overflow: "scroll",
      onPostRender: node => { rendered = node; decorate(node); },
    });
    viewer.render({ file: { name: path, contents, lang: "python" }, containerWrapper: root });
    return () => viewer.cleanUp();
  });
</script>

<div class="coverage-code">
  {#if !coverage}<div class="note">No coverage measurements available for this file.</div>{/if}
  {#if info && selectedLine !== null}
    <div class="line-details" role="status">
      <button aria-label="Close line coverage" onclick={() => selectedLine = null}>×</button>
      <strong>Line {selectedLine} · {label(selectedLine)}</strong>
      {#if info.tests.length}<div>Tests that reached this line:{#each info.tests as id}<code>{id}</code>{/each}</div>{/if}
    </div>
  {/if}
  <div class="source" bind:this={root}></div>
</div>
<style>
  .coverage-code { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .source { flex: 1; min-height: 0; overflow: auto; }
  .line-details, .note { background: #edf2fc; color: #42526a; padding: 12px 16px; font-size: 12px; overflow-wrap: anywhere; }
  .line-details div { margin-top: 8px; } code { display: block; margin-top: 5px; font-size: 11px; }
  button { float: right; background: transparent; border: 0; cursor: pointer; }
</style>
