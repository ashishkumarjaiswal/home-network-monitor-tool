import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function run(cmd, args = [], opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: opts.timeout ?? 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
  } catch (error) {
    const err = error;
    return {
      ok: false,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? err.message,
      code: err.code,
    };
  }
}

export async function runOk(cmd, args = []) {
  const result = await run(cmd, args);
  if (!result.ok) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
