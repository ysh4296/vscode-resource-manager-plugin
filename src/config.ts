import * as vscode from "vscode";

export interface RepositoryConfig {
  gitlabUrl: string;
  projectPath: string;
  jsonPath: string;
  s3BaseUrl: string;
  entryFile: string;
}

const CONFIG_SECTION = "mfeResourceRegistry";
const SECRET_KEY = "mfeResourceRegistry.gitlabToken";

export function getRepositoryConfig(): RepositoryConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    gitlabUrl: config.get<string>("gitlabUrl", ""),
    projectPath: config.get<string>("projectPath", ""),
    jsonPath: config.get<string>("jsonPath", "resources.json"),
    s3BaseUrl: config.get<string>("s3BaseUrl", ""),
    entryFile: config.get<string>("entryFile", "remoteEntry.js"),
  };
}

export async function setRepositoryConfig(values: Partial<RepositoryConfig>): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    }
  }
}

export function isRepositoryConfigComplete(config: RepositoryConfig): boolean {
  return Boolean(config.gitlabUrl && config.projectPath && config.jsonPath && config.s3BaseUrl && config.entryFile);
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
