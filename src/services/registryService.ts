import * as path from "path";
import * as semver from "semver";
import * as vscode from "vscode";
import {
  DEPLOY_HISTORY_DIR,
  RepositoryConfig,
  getGitLabToken,
  getRepositoryConfig,
  isRepositoryConfigComplete,
  setGitLabToken,
  setRepositoryConfig,
} from "../config";
import { buildDeploySnapshot, listDeploySnapshots, readRepositoryVersion, writeDeploySnapshot } from "../registry/deployHistory";
import { listPackageVersions, packageVersionExists } from "../gitlab/packages";
import { GitLabConnection } from "../gitlab/types";
import { readRegistryFile, writeRegistryFile } from "../registry/parser";
import { ResourceRegistry } from "../registry/types";
import * as updater from "../registry/updater";
import { ValidationReport, validateRegistry } from "../registry/validator";
import { buildResourceUrl } from "../resource/buildResourceUrl";
import {
  AppState,
  AutoRegisteredVersion,
  DeploySnapshot,
  RepositoryConfigDTO,
  ResourceVersionStatus,
  ResourceViewModel,
} from "../webview/messages";

export interface MutationResult {
  success: boolean;
  message?: string;
}

/**
 * Orders a resource's registered versions newest-first for display, the
 * same SemVer-aware rule used for GitLab package version lists.
 */
function sortVersionEntries<T>(entries: Array<[string, T]>): Array<[string, T]> {
  const semverEntries = entries.filter(([version]) => semver.valid(version) !== null);
  const nonSemverEntries = entries.filter(([version]) => semver.valid(version) === null);
  semverEntries.sort(([a], [b]) => semver.rcompare(a, b));
  return [...semverEntries, ...nonSemverEntries];
}

/**
 * Owns the in-memory registry, the GitLab live-status lookups shown in the
 * main resource list, and every mutation (register / set-active /
 * add-resource). Each resource lives in its own GitLab repo, so the
 * project to query comes from that resource's own `gitlabProject` field,
 * not from a single global setting. GitLab Package Registry is the sole
 * source of truth for "does this version exist" — S3 is just where the
 * build artifacts happen to be uploaded, so it isn't re-verified here.
 */
export class RegistryService {
  private registry: ResourceRegistry | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly workspaceRoot: string) {}

  private resolveJsonPath(config: RepositoryConfig): string {
    return path.isAbsolute(config.jsonPath) ? config.jsonPath : path.join(this.workspaceRoot, config.jsonPath);
  }

  private resolveDeployHistoryDir(): string {
    return path.join(this.workspaceRoot, DEPLOY_HISTORY_DIR);
  }

  async getGitLabConnection(): Promise<GitLabConnection | undefined> {
    const config = getRepositoryConfig();
    const token = await getGitLabToken(this.context.secrets);
    if (!config.gitlabUrl || !token) {
      return undefined;
    }
    return { baseUrl: config.gitlabUrl, token };
  }

  async saveConfig(values: Omit<RepositoryConfigDTO, "hasToken">): Promise<void> {
    await setRepositoryConfig(values);
  }

  async saveToken(token: string): Promise<void> {
    await setGitLabToken(this.context.secrets, token);
  }

  private async loadRegistry(config: RepositoryConfig): Promise<ResourceRegistry> {
    const { registry } = await readRegistryFile(this.resolveJsonPath(config));
    this.registry = registry;
    return registry;
  }

  private async ensureRegistryLoaded(config: RepositoryConfig): Promise<ResourceRegistry> {
    if (this.registry) {
      return this.registry;
    }
    return this.loadRegistry(config);
  }

  getRegistrySnapshot(): ResourceRegistry | undefined {
    return this.registry;
  }

  getJsonFilePath(): string {
    return this.resolveJsonPath(getRepositoryConfig());
  }

  /**
   * Auto-registration: any version that exists in a resource's own GitLab
   * project but isn't in the JSON's `versions` yet gets added
   * automatically. Registration is no longer a manual, per-version user
   * action — this runs on every getState() call so the resource list
   * always reflects what's actually published in GitLab. Set Active stays
   * a separate, explicit action.
   */
  private async autoRegisterNewVersions(
    registry: ResourceRegistry,
    connection: GitLabConnection,
    config: RepositoryConfig
  ): Promise<{ registry: ResourceRegistry; added: AutoRegisteredVersion[] }> {
    let current = registry;
    const added: AutoRegisteredVersion[] = [];

    for (const [resourceName, resourceConfig] of Object.entries(registry.resources)) {
      if (!resourceConfig.gitlabProject) {
        continue; // No GitLab project configured for this resource yet.
      }

      let gitlabVersions;
      try {
        gitlabVersions = await listPackageVersions(connection, resourceConfig.gitlabProject);
      } catch {
        continue; // GitLab unreachable for this resource this round; try again next refresh.
      }

      for (const versionInfo of gitlabVersions) {
        const version = versionInfo.version;
        if (Object.prototype.hasOwnProperty.call(current.resources[resourceName].versions, version)) {
          continue;
        }

        const url = buildResourceUrl({ baseUrl: config.s3BaseUrl, resourceName, version, entryFile: config.entryFile });
        current = updater.registerVersion(current, resourceName, version, url);
        added.push({ resourceName, version });
      }
    }

    if (added.length > 0) {
      await writeRegistryFile(this.resolveJsonPath(config), current);
      this.registry = current;
    }

    return { registry: current, added };
  }

  /**
   * The host version isn't looked up from GitLab — it's whatever the
   * managed repo's own package.json says. Whenever that version doesn't
   * already have a deploy-history snapshot, one is recorded automatically
   * (capturing every resource's current active version), so history
   * accumulates on its own as the repo's version moves forward — no manual
   * "record snapshot" step. The written file flows through the normal
   * diff/commit/push pipeline like any other change.
   */
  private async autoRecordDeploySnapshot(registry: ResourceRegistry): Promise<string | undefined> {
    const hostVersion = await readRepositoryVersion(this.workspaceRoot);
    if (!hostVersion) {
      return undefined;
    }

    const dir = this.resolveDeployHistoryDir();
    const existing = await listDeploySnapshots(dir);
    if (existing.some((s) => s.hostVersion === hostVersion)) {
      return undefined;
    }

    const snapshot = buildDeploySnapshot(hostVersion, registry);
    await writeDeploySnapshot(dir, snapshot);
    return hostVersion;
  }

  async getState(): Promise<AppState> {
    const config = getRepositoryConfig();
    const hasToken = Boolean(await getGitLabToken(this.context.secrets));
    const configComplete = isRepositoryConfigComplete(config) && hasToken;
    const dto: RepositoryConfigDTO = { ...config, hasToken };

    if (!configComplete) {
      return { config: dto, configComplete: false, resources: [] };
    }

    let registry: ResourceRegistry;
    try {
      registry = await this.loadRegistry(config);
    } catch (err) {
      return { config: dto, configComplete: true, resources: [], loadError: (err as Error).message };
    }

    const connection = await this.getGitLabConnection();
    let autoRegistered: AutoRegisteredVersion[] = [];
    if (connection) {
      const syncResult = await this.autoRegisterNewVersions(registry, connection, config);
      registry = syncResult.registry;
      autoRegistered = syncResult.added;
    }

    const autoSnapshotRecorded = await this.autoRecordDeploySnapshot(registry);

    const resources: ResourceViewModel[] = [];

    for (const [name, resourceConfig] of Object.entries(registry.resources)) {
      const sortedVersionEntries = sortVersionEntries(Object.entries(resourceConfig.versions));
      const versions: ResourceVersionStatus[] = await Promise.all(
        sortedVersionEntries.map(async ([version, versionConfig]): Promise<ResourceVersionStatus> => {
          const gitlabExists =
            connection && resourceConfig.gitlabProject
              ? await packageVersionExists(connection, resourceConfig.gitlabProject, version).catch(() => undefined)
              : undefined;
          return {
            version,
            url: versionConfig.url,
            gitlab: gitlabExists === undefined ? "error" : gitlabExists ? "yes" : "no",
          };
        })
      );
      resources.push({ name, gitlabProject: resourceConfig.gitlabProject, current: resourceConfig.current, versions });
    }

    return {
      config: dto,
      configComplete: true,
      resources,
      autoRegistered: autoRegistered.length > 0 ? autoRegistered : undefined,
      autoSnapshotRecorded,
    };
  }

  async setActiveVersion(resourceName: string, version: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    const resource = registry.resources[resourceName];
    if (!resource) {
      return { success: false, message: `Unknown resource "${resourceName}"` };
    }
    if (!resource.versions[version]) {
      return { success: false, message: `Version "${version}" is not registered for "${resourceName}"` };
    }

    const connection = await this.getGitLabConnection();
    const gitlabExists = connection ? await packageVersionExists(connection, resource.gitlabProject, version) : false;
    if (!gitlabExists) {
      return { success: false, message: "Version does not exist in GitLab Package Registry" };
    }

    const updated = updater.setActiveVersion(registry, resourceName, version);
    await writeRegistryFile(this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async getDeployHistory(): Promise<DeploySnapshot[]> {
    return listDeploySnapshots(this.resolveDeployHistoryDir());
  }

  async addResource(resourceName: string, gitlabProject: string, version: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    if (Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
      return { success: false, message: `Resource "${resourceName}" already exists` };
    }

    const connection = await this.getGitLabConnection();
    const gitlabExists = connection ? await packageVersionExists(connection, gitlabProject, version) : false;
    if (!gitlabExists) {
      return { success: false, message: "Version does not exist in GitLab Package Registry" };
    }

    const url = buildResourceUrl({ baseUrl: config.s3BaseUrl, resourceName, version, entryFile: config.entryFile });
    const updated = updater.addResource(registry, resourceName, gitlabProject, version, url);
    await writeRegistryFile(this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async validate(): Promise<ValidationReport> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    const connection = await this.getGitLabConnection();

    return validateRegistry(registry, {
      s3BaseUrl: config.s3BaseUrl,
      entryFile: config.entryFile,
      packageExists: async (gitlabProject, version) =>
        connection && gitlabProject ? packageVersionExists(connection, gitlabProject, version) : false,
    });
  }
}
