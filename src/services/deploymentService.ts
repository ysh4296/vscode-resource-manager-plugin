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
 * snapshot alongside (or instead of) a resources.json change.
 */
export class DeploymentService {
  private readonly git: SimpleGit;

  constructor(
    private readonly workspaceRoot: string,
    private readonly registryService: RegistryService
  ) {
    this.git = createGitClient(workspaceRoot);
  }

  /** Only paths that currently exist on disk — `git add`/`git diff` reject a pathspec that matches nothing. */
  private trackedPaths(): string[] {
    const config = getRepositoryConfig();
    return [config.jsonPath, DEPLOY_HISTORY_DIR].filter((relPath) => fs.existsSync(path.join(this.workspaceRoot, relPath)));
  }

  async getDiff(): Promise<DiffResult> {
    const diff = await getFileDiff(this.git, this.trackedPaths());

    let summary: ResourceChangeSummary[] = [];
    try {
      const relativeJsonPath = getRepositoryConfig().jsonPath;
      const headContent = await this.git.show([`HEAD:${relativeJsonPath}`]);
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
    const paths = this.trackedPaths();
    if (paths.length > 0) {
      await stageFile(this.git, paths);
    }
    await gitCommit(this.git, message);
  }

  async checkRemoteStatus(): Promise<RemoteCheckResult> {
    return checkRemoteDiverged(this.git);
  }

  async push(): Promise<PushResult> {
    const remoteStatus = await checkRemoteDiverged(this.git);
    if (remoteStatus.diverged) {
      return { success: false, blocked: true, message: remoteStatus.message };
    }
    await gitPush(this.git);
    return { success: true };
  }
}
