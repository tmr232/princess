import { mkdir } from "node:fs/promises";
export async function snapshot(repo: string, head: string, destination: string) {
  await mkdir(destination);
  const archive = Bun.spawn(["git", "archive", "--format=tar", head], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  const extraction = Bun.spawn(["tar", "-xf", "-", "-C", destination], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" });
  const [archiveError, extractionError, archiveCode, extractionCode] = await Promise.all([
    new Response(archive.stderr).text(), new Response(extraction.stderr).text(), archive.exited, extraction.exited,
  ]);
  if (archiveCode || extractionCode) throw new Error(`Unable to prepare head snapshot: ${archiveError}${extractionError}`);
}
export async function pytestCommand(args: string[], cwd: string, env: NodeJS.ProcessEnv, append: (text: string) => void) {
  const proc = Bun.spawn(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, 300_000);
  const consume = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) append(decoder.decode(chunk, { stream: true }));
  };
  try {
    await Promise.all([consume(proc.stdout), consume(proc.stderr)]);
    const code = await proc.exited;
    if (timedOut) throw new Error("Test run timed out after five minutes");
    return code;
  } finally { clearTimeout(timer); }
}
