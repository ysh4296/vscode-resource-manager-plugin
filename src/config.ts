import * as vscode from "vscode";

export interface RepositoryConfig {
  /** Git clone URL (SSH or HTTPS) of the repo that holds the registry JSON. The extension manages its own local clone of this — it does not operate on whatever folder happens to be open in VS Code. */
  repositoryUrl: string;
  jsonPath: string;
  entryFile: string;
}

/** Internal, not user-configurable — folder (relative to the workspace root) where deploy-history snapshots are written. */
export const DEPLOY_HISTORY_DIR = "deploy-history";

const CONFIG_SECTION = "mfeResourceRegistry";
const SECRET_KEY = "mfeResourceRegistry.gitlabToken";

export function getRepositoryConfig(): RepositoryConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    repositoryUrl: config.get<string>("repositoryUrl", ""),
    jsonPath: config.get<string>("jsonPath", "resources.json"),
    entryFile: config.get<string>("entryFile", "remoteEntry.js"),
  };
}

export async function setRepositoryConfig(values: Partial<RepositoryConfig>): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      // Global (User) settings, not Workspace — the extension no longer requires
      // a workspace to be open at all, so a workspace-scoped setting could fail to persist.
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }
}

export function isRepositoryConfigComplete(config: RepositoryConfig): boolean {
  return Boolean(config.repositoryUrl && config.jsonPath && config.entryFile);
}

/**
 * The GitLab token is deliberately kept out of both the registry JSON and
 * workspace settings; it only ever lives in VS Code's SecretStorage.
 */
export async function getGitLabToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

export async function setGitLabToken(secrets: vscode.SecretStorage, token: string): Promise<void> {
  await secrets.store(SECRET_KEY, token);
}

export async function clearGitLabToken(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
}
