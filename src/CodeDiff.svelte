<script lang="ts">
  import { lineCoverage, originalLine, type FileCoverage } from "./codeCoverage";
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
  export let coverage: FileCoverage | undefined = undefined;
  export let coverageStatus = "idle";
  export let testFilter = "";
  let selectedLine: number | null = null;
  let rendered: { node: HTMLElement; side?: "before" | "after" }[] = [];
  $: testOptions = [...new Set(Object.values(coverage?.contexts ?? {}).flat()
    .filter(context => context.endsWith("|run")).map(context => context.slice(0, -4)))].sort();
  $: if (testFilter && !testOptions.includes(testFilter)) testFilter = "";
  $: selectedCoverage = coverage && selectedLine !== null ? lineCoverage(coverage, selectedLine, testFilter) : null;
  $: { coverage; testFilter; for (const item of rendered) paintCoverage(item.node, item.side); }
  let root: HTMLDivElement;
  let oldRoot: HTMLDivElement, newRoot: HTMLDivElement;

  function isBefore(element: HTMLElement, side?: "before" | "after") {
    return side ? side === "before" : element.closest("[data-deletions]") !== null ||
      element.dataset.lineType === "change-deletion" || after === null;
  }
  function description(line: number) {
    if (!coverage) return "";
    const info = lineCoverage(coverage, line, testFilter);
    if (!info) return "";
    if (info.status === "covered") return testFilter ? `Covered by ${testFilter}` : `Covered by ${info.tests.length} test${info.tests.length === 1 ? "" : "s"}: ${info.tests.join(", ")}`;
    if (info.status === "outside") return "Executed outside test calls (imports, setup or teardown)";
    return testFilter ? `Not covered by ${testFilter}` : "Not executed";
  }
  function paintCoverage(node: HTMLElement, side?: "before" | "after") {
    const dom = node.shadowRoot ?? node;
    dom.querySelectorAll<HTMLElement>("[data-column-number], [data-content] > [data-line]").forEach(element => {
      const old = isBefore(element, side);
      const index = Number(element.dataset.columnNumber ?? element.dataset.line);
      const line = originalLine(index, old ? beforeStart : afterStart, old ? beforeLines : afterLines);
      const info = !old && coverage && line !== null ? lineCoverage(coverage, line, testFilter) : null;
      // Remove decoration when the report/filter changes; keep diff indicators intact.
      element.style.removeProperty("background-color");
      element.style.removeProperty("box-shadow");
      element.style.removeProperty("cursor");
      element.removeAttribute("data-coverage");
      element.removeAttribute("data-coverage-line");
      element.removeAttribute("title");
      element.removeAttribute("aria-label");
      element.removeAttribute("tabindex");
      element.removeAttribute("role");
      element.onclick = null; element.onkeydown = null;
      if (!info || line === null) return;
      const colors = { covered: ["#e1f5eb", "#258459"], uncovered: ["#ffe8eb", "#c2525a"], outside: ["#eef1f5", "#8b98a8"] };
      element.dataset.coverage = info.status;
      element.dataset.coverageLine = String(line);
      element.style.setProperty("background-color", colors[info.status][0]!, "important");
      element.style.setProperty("box-shadow", `inset 3px 0 ${colors[info.status][1]}`);
      element.style.cursor = "pointer";
      element.title = description(line);
      element.setAttribute("aria-label", `After line ${line}: ${description(line)}`);
      // Gutter controls make attribution available with the keyboard too.
      if (element.dataset.columnNumber) {
        element.tabIndex = 0;
        element.setAttribute("role", "button");
        element.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedLine = line; } };
      }
      element.onclick = () => selectedLine = line;
    });
  }
  function numberGutters(node: HTMLElement, side?: "before" | "after") {
    const dom = node.shadowRoot ?? node;
    dom.querySelectorAll<HTMLElement>("[data-column-number]").forEach(gutter => {
      const content = gutter.querySelector("[data-line-number-content]");
      if (!content) return;
      const old = isBefore(gutter, side);
      const number = originalLine(Number(gutter.dataset.columnNumber), old ? beforeStart : afterStart, old ? beforeLines : afterLines);
      content.textContent = number == null ? "" : String(number);
    });
    if (!rendered.some(item => item.node === node)) rendered = [...rendered, { node, side }];
    paintCoverage(node, side);
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
          onPostRender: (node) => numberGutters(node, i || diffStyle === "unified" ? "after" : "before"),
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

<div class="code-review">
  {#if coverage && after !== null}
    <div class="coverage-legend" aria-label="Code coverage controls">
      <strong>Head coverage</strong>
      <span class="covered">● Covered</span><span class="uncovered">● Not covered</span><span class="outside">● Outside test calls</span>
      <label>Test <select aria-label="Coverage test filter" bind:value={testFilter}><option value="">All executed tests</option>{#each testOptions as test}<option value={test}>{test}</option>{/each}</select></label>
      <small>Click a highlighted line to see its tests. Before revision has no coverage.</small>
    </div>
    {#if selectedLine !== null && selectedCoverage}
      <div class="line-details" role="status">
        <button aria-label="Close line coverage" onclick={() => selectedLine = null}>×</button>
        <strong>After line {selectedLine} · {description(selectedLine)}</strong>
        {#if selectedCoverage.tests.length}<div class="line-tests"><span>Tests that reached this line:</span>{#each selectedCoverage.tests as test}<code>{test}</code>{/each}</div>{/if}
      </div>
    {/if}
  {:else if coverageStatus === "running"}<div class="coverage-note" role="status">Coverage run in progress…</div>
  {:else if coverageStatus === "complete"}<div class="coverage-note">{after === null ? "Removed code has no head coverage." : "This file was not measured by the coverage run."}</div>{/if}
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
</div>

<style>
  .code-review { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .coverage-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 12px 16px; border: 1px solid #dce3eb; border-bottom: 0; background: white; border-radius: 9px 9px 0 0; font-size: 12px; }
  .covered { color: #258459; } .uncovered { color: #c2525a; } .outside { color: #778698; }
  label { display: flex; align-items: center; gap: 8px; margin-left: auto; }
  select { max-width: 340px; font: inherit; padding: 5px; border: 1px solid #dce3eb; border-radius: 4px; }
  small { flex-basis: 100%; color: #7b8b9f; }
  .line-details, .coverage-note { background: #edf2fc; padding: 12px 16px; font-size: 12px; color: #42526a; overflow-wrap: anywhere; }
  .line-tests { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }
  .line-details button { float: right; background: transparent; border: 0; cursor: pointer; font-size: 18px; }
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
