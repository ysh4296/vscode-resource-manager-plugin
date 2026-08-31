import { SimpleGit } from "simple-git";
import { getRepositoryConfig } from "../config";
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
 * remote simply blocks the push.
 */
export class DeploymentService {
  private readonly git: SimpleGit;

  constructor(
    workspaceRoot: string,
    private readonly registryService: RegistryService
  ) {
    this.git = createGitClient(workspaceRoot);
  }

  private relativeJsonPath(): string {
    return getRepositoryConfig().jsonPath;
  }

  async getDiff(): Promise<DiffResult> {
    const relativePath = this.relativeJsonPath();
    const diff = await getFileDiff(this.git, relativePath);

    let summary: ResourceChangeSummary[] = [];
    try {
      const headContent = await this.git.show([`HEAD:${relativePath}`]);
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
    const relativePath = this.relativeJsonPath();
    await stageFile(this.git, relativePath);
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
