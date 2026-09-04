import * as fs from "fs";
import * as path from "path";
import { SimpleGit } from "simple-git";
import { DEPLOY_HISTORY_DIR, getRepositoryConfig } from "../config";
import { commit as gitCommit, createGitClient, push as gitPush, stageFile } from "../git/client";
import { RemoteCheckResult, checkRemoteDiverged } from "../git/conflict";
import { ResourceChangeSummary, buildDefaultCommitMessage, getFileDiff, summarizeRegistryDiff } from "../git/diff";
import { ResourceRegistry } from "../registry/types";
import { RegistryService } from "./registryService";

export interface DiffResult {
  diff: string;
  summary: ResourceChangeSummary[];
  defaultCommitMessage: string;
}

export interface PushResult {
  success: boolean;
  message?: string;
  blocked?: boolean;
}

/**
 * Owns the Git side of the workflow: diff, commit, remote-divergence check,
 * and push. Never merges or rebases on the user's behalf — a diverged
 * remote simply blocks the push. Tracks both the registry JSON and the
 * deploy-history folder, since a push can carry a new deploy-history
 * snapshot alongside (or instead of) a resources.json change. Operates on
 * RegistryService's managed clone (see RegistryService.getRepoRoot), not
 * on whatever folder happens to be open in VS Code.
 */
export class DeploymentService {
  private git: SimpleGit | undefined;
  private gitRoot: string | undefined;

  constructor(private readonly registryService: RegistryService) {}

  private async getGit(): Promise<{ git: SimpleGit; root: string }> {
    const root = await this.registryService.getRepoRoot();
    if (!this.git || this.gitRoot !== root) {
      this.git = createGitClient(root);
      this.gitRoot = root;
    }
    return { git: this.git, root };
  }

  /** Only paths that currently exist on disk — `git add`/`git diff` reject a pathspec that matches nothing. */
  private trackedPaths(root: string): string[] {
    const config = getRepositoryConfig();
    return [config.jsonPath, DEPLOY_HISTORY_DIR].filter((relPath) => fs.existsSync(path.join(root, relPath)));
  }

  async getDiff(): Promise<DiffResult> {
    const { git, root } = await this.getGit();
    const diff = await getFileDiff(git, this.trackedPaths(root));

    let summary: ResourceChangeSummary[] = [];
    try {
      const relativeJsonPath = getRepositoryConfig().jsonPath;
      const headContent = await git.show([`HEAD:${relativeJsonPath}`]);
      const oldRegistry = JSON.parse(headContent) as ResourceRegistry;
      const current = this.registryService.getRegistrySnapshot();
      if (current) {
        summary = summarizeRegistryDiff(oldRegistry, current);
      }
    } catch {
      // No HEAD version of the file yet (new file, or not committed before).
    }

    return { diff, summary, defaultCommitMessage: buildDefaultCommitMessage(summary) };
  }

  async commit(message: string): Promise<void> {
    const { git, root } = await this.getGit();
    const paths = this.trackedPaths(root);
    if (paths.length > 0) {
      await stageFile(git, paths);
    }
    await gitCommit(git, message);
  }

  async checkRemoteStatus(): Promise<RemoteCheckResult> {
    const { git } = await this.getGit();
    return checkRemoteDiverged(git);
  }

  async push(): Promise<PushResult> {
    const { git } = await this.getGit();
    const remoteStatus = await checkRemoteDiverged(git);
    if (remoteStatus.diverged) {
      return { success: false, blocked: true, message: remoteStatus.message };
    }
    await gitPush(git);
    return { success: true };
  }
}
