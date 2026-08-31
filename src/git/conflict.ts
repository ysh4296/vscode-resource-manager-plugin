import { SimpleGit } from "simple-git";
import { fetchRemote, getBranchInfo } from "./client";

export interface RemoteCheckResult {
  diverged: boolean;
  ahead: number;
  behind: number;
  message: string;
}

/**
 * Fetches the remote (read-only — never merges or rebases) and reports
 * whether the remote branch has moved ahead of local HEAD. Callers should
 * block pushing whenever `diverged` is true rather than attempting any
 * automatic reconciliation.
 */
export async function checkRemoteDiverged(git: SimpleGit, remote = "origin"): Promise<RemoteCheckResult> {
  await fetchRemote(git, remote);
  const info = await getBranchInfo(git);
  const diverged = info.behind > 0;

  return {
    diverged,
    ahead: info.ahead,
    behind: info.behind,
    message: diverged
      ? `Remote branch has changed (${info.behind} new commit(s)). Please update your local branch before pushing.`
      : "Local branch is up to date with remote.",
  };
}
