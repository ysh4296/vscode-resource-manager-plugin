import * as crypto from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import simpleGit from "simple-git";

/**
 * The extension no longer operates on whatever folder happens to be open
 * in VS Code — it manages its own local clone of the configured
 * repository, keyed by the repository URL so switching repos doesn't
 * require re-cloning every time you switch back. Cloning relies on
 * whatever git credentials (SSH key, HTTPS credential helper) are already
 * set up locally, same as any other git operation this extension performs.
 */
export function resolveCloneDir(storageRoot: string, repositoryUrl: string): string {
  const hash = crypto.createHash("sha1").update(repositoryUrl.trim()).digest("hex").slice(0, 16);
  return path.join(storageRoot, "repos", hash);
}

export class RepoCloneError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "RepoCloneError";
  }
}

/** Clones the repository into cloneDir if it isn't already there. Never pulls/fetches an existing clone here — that's left to explicit "Fetch & Check Remote". */
export async function ensureRepoCloned(cloneDir: string, repositoryUrl: string): Promise<void> {
  const gitDir = path.join(cloneDir, ".git");
  if (fs.existsSync(gitDir)) {
    return;
  }

  await fsPromises.mkdir(path.dirname(cloneDir), { recursive: true });
  try {
    await simpleGit().clone(repositoryUrl, cloneDir);
  } catch (err) {
    // Clean up a partial clone so the next attempt doesn't see a half-cloned directory and skip cloning.
    await fsPromises.rm(cloneDir, { recursive: true, force: true }).catch(() => undefined);
    throw new RepoCloneError(`Failed to clone "${repositoryUrl}": ${err instanceof Error ? err.message : String(err)}`, err);
  }
}
