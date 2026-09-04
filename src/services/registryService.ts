import * as path from "path";
import * as semver from "semver";
import * as vscode from "vscode";
import { DEPLOY_HISTORY_DIR, RepositoryConfig, getGitLabToken, getRepositoryConfig, isRepositoryConfigComplete, setGitLabToken, setRepositoryConfig } from "../config";
import { buildDeploySnapshot, listDeploySnapshots, readRepositoryVersion, writeDeploySnapshot } from "../registry/deployHistory";
import { testConnection } from "../gitlab/client";
import { getRepositoryPackageVersion } from "../gitlab/repositoryVersion";
import { parseMicroserviceUrl } from "../gitlab/projectUrl";
import { GitLabConnection } from "../gitlab/types";
import { ensureRepoCloned, resolveCloneDir } from "../git/repoManager";
import { readRegistryFile, writeRegistryFile } from "../registry/parser";
import { ResourceRegistry } from "../registry/types";
import * as updater from "../registry/updater";
import { ValidationReport, validateRegistry } from "../registry/validator";
import { buildResourceUrl } from "../resource/buildResourceUrl";
import { checkCdnReachable } from "../resource/cdnReachability";
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
 * add-resource). The extension does not operate on whatever folder happens
 * to be open in VS Code — it manages its own local clone of the
 * `repositoryUrl` configured in Settings (see git/repoManager.ts), keyed by
 * that URL.
 *
 * Each resource carries its own full `microserviceUrl` (GitLab instance +
 * project, e.g. "https://gitlab.example.com/frontend/app1") rather than
 * relying on one global GitLab instance setting — different MFEs can
 * genuinely live on different GitLab instances. The Personal Access Token
 * is still shared across all of them (see Settings). A resource's own
 * package.json on its GitLab project's default branch is the sole source
 * of truth for "what version is currently live" — no git tags or Package
 * Registry publish step required. CDN is just where the build artifacts
 * happen to be uploaded, so it isn't re-verified here.
 */
export class RegistryService {
  private registry: ResourceRegistry | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly storageRoot: string) {}

  /**
   * Resolves (cloning on first use) the local working copy of the
   * configured repository. Public so DeploymentService can point its git
   * client at the same clone without duplicating the clone logic.
   */
  async getRepoRoot(): Promise<string> {
    const config = getRepositoryConfig();
    if (!config.repositoryUrl) {
      throw new Error("Repository URL is not configured");
    }
    const cloneDir = resolveCloneDir(this.storageRoot, config.repositoryUrl);
    await ensureRepoCloned(cloneDir, config.repositoryUrl);
    return cloneDir;
  }

  private async resolveJsonPath(config: RepositoryConfig): Promise<string> {
    const root = await this.getRepoRoot();
    return path.isAbsolute(config.jsonPath) ? config.jsonPath : path.join(root, config.jsonPath);
  }

  private async resolveDeployHistoryDir(): Promise<string> {
    const root = await this.getRepoRoot();
    return path.join(root, DEPLOY_HISTORY_DIR);
  }

  /**
   * Combines the shared token with a specific resource's own microserviceUrl
   * to get a GitLab connection scoped to that resource's instance, plus the
   * project path within it. Returns undefined if there's no token yet or
   * the URL doesn't parse — both are treated as "can't verify right now".
   */
  private async resolveGitLabAccess(
    microserviceUrl: string
  ): Promise<{ connection: GitLabConnection; projectPath: string } | undefined> {
    const token = await getGitLabToken(this.context.secrets);
    if (!token) {
      return undefined;
    }
    try {
      const { baseUrl, projectPath } = parseMicroserviceUrl(microserviceUrl);
      return { connection: { baseUrl, token }, projectPath };
    } catch {
      return undefined;
    }
  }

  async saveConfig(values: Omit<RepositoryConfigDTO, "hasToken">): Promise<void> {
    await setRepositoryConfig(values);
  }

  async saveToken(token: string): Promise<void> {
    await setGitLabToken(this.context.secrets, token);
  }

  private async loadRegistry(config: RepositoryConfig): Promise<ResourceRegistry> {
    const { registry } = await readRegistryFile(await this.resolveJsonPath(config));
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

  /**
   * Auto-registration: whatever version a resource's own package.json
   * currently says on GitLab, if it isn't in the JSON's `versions` yet,
   * gets added *and* promoted to `current` automatically — GitLab only
   * ever reports one live version per resource, so there's no separate
   * "pick which registered version to activate" decision to gate behind a
   * manual step. This runs on every getState() call so the resource list
   * always reflects what's actually live on GitLab.
   */
  private async autoRegisterNewVersions(
    registry: ResourceRegistry,
    config: RepositoryConfig
  ): Promise<{ registry: ResourceRegistry; added: AutoRegisteredVersion[] }> {
    let current = registry;
    const added: AutoRegisteredVersion[] = [];

    for (const [resourceName, resourceConfig] of Object.entries(registry.resources)) {
      if (!resourceConfig.microserviceUrl || !resourceConfig.cdnBaseUrl) {
        continue; // Microservice URL and/or CDN base URL not configured for this resource yet.
      }

      const access = await this.resolveGitLabAccess(resourceConfig.microserviceUrl);
      if (!access) {
        continue; // No token yet, or the URL doesn't parse; try again next refresh.
      }

      const version = await getRepositoryPackageVersion(access.connection, access.projectPath);
      if (!version) {
        continue; // No package.json / no version field / GitLab unreachable this round; try again next refresh.
      }

      if (Object.prototype.hasOwnProperty.call(current.resources[resourceName].versions, version)) {
        continue; // Already registered.
      }

      const url = buildResourceUrl({
        baseUrl: resourceConfig.cdnBaseUrl,
        projectPath: access.projectPath,
        version,
        entryFile: config.entryFile,
      });
      current = updater.registerVersion(current, resourceName, version, url);
      // GitLab only ever reports one "live" version per resource, so there's
      // no separate choice to make here — whatever just got auto-registered
      // *is* the version that should be serving. No manual promotion step.
      current = updater.setActiveVersion(current, resourceName, version);
      added.push({ resourceName, version });
    }

    if (added.length > 0) {
      await writeRegistryFile(await this.resolveJsonPath(config), current);
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
    const root = await this.getRepoRoot();
    const hostVersion = await readRepositoryVersion(root);
    if (!hostVersion) {
      return undefined;
    }

    const dir = await this.resolveDeployHistoryDir();
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

    const syncResult = await this.autoRegisterNewVersions(registry, config);
    registry = syncResult.registry;
    const autoRegistered = syncResult.added;

    const autoSnapshotRecorded = await this.autoRecordDeploySnapshot(registry);

    const resources: ResourceViewModel[] = [];

    for (const [name, resourceConfig] of Object.entries(registry.resources)) {
      const access = resourceConfig.microserviceUrl ? await this.resolveGitLabAccess(resourceConfig.microserviceUrl) : undefined;
      const liveVersion = access ? await getRepositoryPackageVersion(access.connection, access.projectPath) : undefined;
      const sortedVersionEntries = sortVersionEntries(Object.entries(resourceConfig.versions));
      const versions: ResourceVersionStatus[] = sortedVersionEntries.map(([version, versionConfig]): ResourceVersionStatus => ({
        version,
        url: versionConfig.url,
        gitlab: !access ? "error" : liveVersion === undefined ? "error" : liveVersion === version ? "yes" : "no",
      }));
      resources.push({
        name,
        microserviceUrl: resourceConfig.microserviceUrl,
        cdnBaseUrl: resourceConfig.cdnBaseUrl,
        current: resourceConfig.current,
        versions,
      });
    }

    return {
      config: dto,
      configComplete: true,
      resources,
      autoRegistered: autoRegistered.length > 0 ? autoRegistered : undefined,
      autoSnapshotRecorded,
    };
  }

  /**
   * Lets a resource's microservice URL (GitLab instance + project) and CDN
   * base URL be set/changed together from the UI instead of hand-editing
   * resources.json — entered and verified as a pair: the GitLab project
   * must actually exist (when a token is configured) and the CDN base
   * URL's host must actually respond, or nothing is saved.
   */
  async setResourceLocation(resourceName: string, microserviceUrl: string, cdnBaseUrl: string): Promise<MutationResult> {
    const trimmedUrl = microserviceUrl.trim();
    const trimmedCdn = cdnBaseUrl.trim();
    if (!trimmedUrl) {
      return { success: false, message: "Microservice URL is required" };
    }
    if (!trimmedCdn) {
      return { success: false, message: "CDN base URL is required" };
    }

    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    if (!registry.resources[resourceName]) {
      return { success: false, message: `Unknown resource "${resourceName}"` };
    }

    let projectPath: string;
    try {
      projectPath = parseMicroserviceUrl(trimmedUrl).projectPath;
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }

    const access = await this.resolveGitLabAccess(trimmedUrl);
    if (access) {
      const result = await testConnection(access.connection, projectPath);
      if (!result.ok) {
        return { success: false, message: `Could not reach "${trimmedUrl}": ${result.message}` };
      }
    }

    const cdnCheck = await checkCdnReachable(trimmedCdn);
    if (!cdnCheck.reachable) {
      return { success: false, message: `Could not reach CDN base URL "${trimmedCdn}": ${cdnCheck.message}` };
    }

    const updated = updater.setResourceLocation(registry, resourceName, trimmedUrl, trimmedCdn);
    await writeRegistryFile(await this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async getDeployHistory(): Promise<DeploySnapshot[]> {
    return listDeploySnapshots(await this.resolveDeployHistoryDir());
  }

  async addResource(resourceName: string, microserviceUrl: string, cdnBaseUrl: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    if (Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
      return { success: false, message: `Resource "${resourceName}" already exists` };
    }

    const access = await this.resolveGitLabAccess(microserviceUrl);
    const liveVersion = access ? await getRepositoryPackageVersion(access.connection, access.projectPath) : undefined;
    if (!liveVersion) {
      return {
        success: false,
        message: "Could not read a version from this resource's package.json on GitLab — check the Microservice URL and Token",
      };
    }

    const url = buildResourceUrl({ baseUrl: cdnBaseUrl, projectPath: access!.projectPath, version: liveVersion, entryFile: config.entryFile });
    const updated = updater.addResource(registry, resourceName, microserviceUrl, cdnBaseUrl, liveVersion, url);
    await writeRegistryFile(await this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async removeResource(resourceName: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    if (!registry.resources[resourceName]) {
      return { success: false, message: `Unknown resource "${resourceName}"` };
    }

    const updated = updater.removeResource(registry, resourceName);
    await writeRegistryFile(await this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async validate(): Promise<ValidationReport> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);

    return validateRegistry(registry, {
      entryFile: config.entryFile,
      isCurrentVersion: async (microserviceUrl, version) => {
        const access = await this.resolveGitLabAccess(microserviceUrl);
        if (!access) {
          return false;
        }
        const liveVersion = await getRepositoryPackageVersion(access.connection, access.projectPath);
        return liveVersion === version;
      },
    });
  }
}
