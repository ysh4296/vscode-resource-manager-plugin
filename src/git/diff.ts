import { SimpleGit } from "simple-git";
import { ResourceRegistry } from "../registry/types";

/**
 * Returns the actual `git diff` text covering the given paths (typically
 * the registry JSON plus the deploy-history folder). Paths are staged
 * first so a brand-new untracked file (e.g. a fresh deploy-history
 * snapshot) shows up as an addition instead of being invisible to `git
 * diff`; the same staging happens again right before commit, so this has
 * no effect beyond making the diff view accurate.
 */
export async function getFileDiff(git: SimpleGit, paths: string[]): Promise<string> {
  if (paths.length === 0) {
    return "";
  }
  await git.add(paths).catch(() => undefined);
  return git.diff(["--cached", "--", ...paths]);
}

export interface ResourceChangeSummary {
  resourceName: string;
  currentChanged?: { from: string; to: string };
  addedVersions: string[];
  removedVersions: string[];
}

/**
 * Structured (non-textual) summary of what changed between two registry
 * snapshots, used to render a friendlier diff view and to seed the default
 * commit message. This is a supplement to the real `git diff` text, not a
 * replacement for it.
 */
export function summarizeRegistryDiff(
  oldRegistry: ResourceRegistry,
  newRegistry: ResourceRegistry
): ResourceChangeSummary[] {
  const names = new Set([...Object.keys(oldRegistry.resources), ...Object.keys(newRegistry.resources)]);
  const summaries: ResourceChangeSummary[] = [];

  for (const name of names) {
    const oldConfig = oldRegistry.resources[name];
    const newConfig = newRegistry.resources[name];
    const oldVersions = new Set(Object.keys(oldConfig?.versions ?? {}));
    const newVersions = new Set(Object.keys(newConfig?.versions ?? {}));

    const addedVersions = [...newVersions].filter((v) => !oldVersions.has(v));
    const removedVersions = [...oldVersions].filter((v) => !newVersions.has(v));
    const currentChanged =
      oldConfig && newConfig && oldConfig.current !== newConfig.current
        ? { from: oldConfig.current, to: newConfig.current }
        : undefined;

    if (currentChanged || addedVersions.length > 0 || removedVersions.length > 0) {
      summaries.push({ resourceName: name, currentChanged, addedVersions, removedVersions });
    }
  }

  return summaries;
}

export function buildDefaultCommitMessage(summaries: ResourceChangeSummary[]): string {
  const activations = summaries.filter((s) => s.currentChanged);

  if (activations.length === 1 && summaries.length === 1) {
    return `chore: update ${activations[0].resourceName} to ${activations[0].currentChanged!.to}`;
  }
  if (summaries.length === 1) {
    return `chore: update ${summaries[0].resourceName} resource registry`;
  }
  return "chore: update MFE resource versions";
}
