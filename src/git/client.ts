import simpleGit, { SimpleGit, StatusResult } from "simple-git";

export function createGitClient(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd });
}

export function getStatus(git: SimpleGit): Promise<StatusResult> {
  return git.status();
}

export async function stageFile(git: SimpleGit, filePath: string): Promise<void> {
  await git.add(filePath);
}

export async function commit(git: SimpleGit, message: string): Promise<void> {
  await git.commit(message);
}

export async function fetchRemote(git: SimpleGit, remote = "origin"): Promise<void> {
  await git.fetch(remote);
}

export async function push(git: SimpleGit): Promise<void> {
  await git.push();
}

export interface BranchInfo {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
}

export async function getBranchInfo(git: SimpleGit): Promise<BranchInfo> {
  const status = await git.status();
  return {
    current: status.current ?? "",
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
  };
}
