# Function Graph Overview engine

Python control-flow sources, shared DOT rendering dependencies, and core/Python parser WASMs from https://github.com/tmr232/function-graph-overview at commit f1f18a3ae2a00cf44ab3cbe9b7f843fbe9c3e360. See LICENSE.txt for MIT attribution. Princess uses the Python builder and DOT renderer directly rather than the VS Code shell or single-pane Svelte components.

Local changes: the DOT renderer uses Arial with extra label padding for browser font metrics, and omits cluster labels when a node has no cluster, avoiding an `undefined undefined` heading in detailed graph labels. All other included upstream sources are unmodified. Parser license notices are retained under `parsers/`.
