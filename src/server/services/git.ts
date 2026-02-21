import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

const CWD = process.cwd();

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd: CWD });
  return stdout.trim();
}

export async function hasChanges(): Promise<boolean> {
  const status = await git("status", "--porcelain", "data/");
  return status.length > 0;
}

export async function commitAndPush(message: string): Promise<void> {
  if (!(await hasChanges())) return;

  await git("add", "data/");
  await git("commit", "-m", message);

  try {
    await git("push");
  } catch (err) {
    console.error("Failed to push (will retry next time):", err);
  }
}
