import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { parse } from "shell-quote";

export type PytestOptions = { command: string[]; directory: string };
export const defaultPytestOptions: PytestOptions = { command: ["uv", "run", "pytest"], directory: "." };

export function parsePytestCommand(command: string): string[] {
  const args = parse(command, key => `$${key}`);
  if (!args.length || args.some(arg => typeof arg !== "string") || !args[0])
    throw new Error("Pytest command must be an executable and arguments, without shell operators or globs");
  return args as string[];
}

export function pytestInvocation(root: string, ids: string[], options: PytestOptions) {
  const cwd = resolve(root, options.directory);
  if (isAbsolute(options.directory) || (cwd !== root && !cwd.startsWith(root + sep)))
    throw new Error("Pytest directory must be relative to and inside the reviewed repository");
  // Keep report node IDs repository-relative even when pytest runs in a subproject.
  const selectors = ids.map(id => {
    const [path, ...names] = id.split("::");
    return [resolve(root, path!), ...names].join("::");
  });
  return { cwd, args: [...options.command, ...selectors, `--rootdir=${root}`] };
}

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
