import * as path from "path";
import * as semver from "semver";
import * as vscode from "vscode";
import {
  RepositoryConfig,
  getGitLabToken,
  getRepositoryConfig,
  isRepositoryConfigComplete,
  setGitLabToken,
  setRepositoryConfig,
} from "../config";
import { listPackageVersions, packageVersionExists } from "../gitlab/packages";
import { GitLabConfig } from "../gitlab/types";
import { readRegistryFile, writeRegistryFile } from "../registry/parser";
import { ResourceRegistry } from "../registry/types";
import * as updater from "../registry/updater";
import { ValidationReport, validateRegistry } from "../registry/validator";
import { buildResourceUrl } from "../resource/buildResourceUrl";
import { checkResourceExists } from "../resource/validateResource";
import {
  AppState,
  CandidateCheckResult,
  PackageVersionOption,
  RepositoryConfigDTO,
  ResourceVersionStatus,
  ResourceViewModel,
} from "../webview/messages";

export class RegistryServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryServiceError";
  }
}

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
 * Owns the in-memory registry, the GitLab/S3 live-status lookups shown in
 * the main resource list, and every mutation (register / set-active /
 * add-resource). Mutations always re-verify GitLab + S3 server-side before
 * writing, even though the webview already ran the same checks — the UI
 * check is for feedback, this one is the actual gate.
 */
export class RegistryService {
  private registry: ResourceRegistry | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly workspaceRoot: string) {}

  private resolveJsonPath(config: RepositoryConfig): string {
    return path.isAbsolute(config.jsonPath) ? config.jsonPath : path.join(this.workspaceRoot, config.jsonPath);
  }

  async getGitLabConfig(): Promise<GitLabConfig | undefined> {
    const config = getRepositoryConfig();
    const token = await getGitLabToken(this.context.secrets);
    if (!config.gitlabUrl || !config.projectPath || !token) {
      return undefined;
    }
    return { baseUrl: config.gitlabUrl, projectPath: config.projectPath, token };
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

    const gitlabConfig = await this.getGitLabConfig();
    const resources: ResourceViewModel[] = [];

    for (const [name, resourceConfig] of Object.entries(registry.resources)) {
      const sortedVersionEntries = sortVersionEntries(Object.entries(resourceConfig.versions));
      const versions: ResourceVersionStatus[] = await Promise.all(
        sortedVersionEntries.map(async ([version, versionConfig]): Promise<ResourceVersionStatus> => {
          const [gitlabExists, s3Result] = await Promise.all([
            gitlabConfig
              ? packageVersionExists(gitlabConfig, name, version).catch(() => undefined)
              : Promise.resolve(undefined),
            checkResourceExists(versionConfig.url),
          ]);
          return {
            version,
            url: versionConfig.url,
            gitlab: gitlabExists === undefined ? "error" : gitlabExists ? "yes" : "no",
            s3: s3Result.status,
          };
        })
      );
      resources.push({ name, current: resourceConfig.current, versions });
    }

    return { config: dto, configComplete: true, resources };
  }

  async getPackageVersions(resourceName: string): Promise<PackageVersionOption[]> {
    const config = getRepositoryConfig();
    const gitlabConfig = await this.getGitLabConfig();
    if (!gitlabConfig) {
      throw new RegistryServiceError("GitLab is not configured");
    }
    const registry = await this.ensureRegistryLoaded(config);
    const registered = new Set(Object.keys(registry.resources[resourceName]?.versions ?? {}));
    const versions = await listPackageVersions(gitlabConfig, resourceName);

    return versions.map((v) => ({
      version: v.version,
      isSemver: v.isSemver,
      alreadyRegistered: registered.has(v.version),
      generatedUrl: buildResourceUrl({
        baseUrl: config.s3BaseUrl,
        resourceName,
        version: v.version,
        entryFile: config.entryFile,
      }),
    }));
  }

  async checkCandidate(resourceName: string, version: string): Promise<CandidateCheckResult> {
    const config = getRepositoryConfig();
    const gitlabConfig = await this.getGitLabConfig();
    const url = buildResourceUrl({ baseUrl: config.s3BaseUrl, resourceName, version, entryFile: config.entryFile });

    const [gitlabExists, s3Result] = await Promise.all([
      gitlabConfig ? packageVersionExists(gitlabConfig, resourceName, version) : Promise.resolve(false),
      checkResourceExists(url),
    ]);

    return { resourceName, version, url, gitlabExists, s3: s3Result.status };
  }

  async registerVersion(resourceName: string, version: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    const resource = registry.resources[resourceName];
    if (!resource) {
      return { success: false, message: `Unknown resource "${resourceName}"` };
    }
    if (Object.prototype.hasOwnProperty.call(resource.versions, version)) {
      return { success: false, message: `Version "${version}" is already registered` };
    }

    const check = await this.checkCandidate(resourceName, version);
    if (!check.gitlabExists) {
      return { success: false, message: "Version does not exist in GitLab Package Registry" };
    }
    if (check.s3 !== "available") {
      return { success: false, message: `S3 resource is not available (status: ${check.s3})` };
    }

    const updated = updater.registerVersion(registry, resourceName, version, check.url);
    await writeRegistryFile(this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async setActiveVersion(resourceName: string, version: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    const resource = registry.resources[resourceName];
    if (!resource) {
      return { success: false, message: `Unknown resource "${resourceName}"` };
    }
    const versionEntry = resource.versions[version];
    if (!versionEntry) {
      return { success: false, message: `Version "${version}" is not registered for "${resourceName}"` };
    }

    const gitlabConfig = await this.getGitLabConfig();
    const [gitlabExists, s3Result] = await Promise.all([
      gitlabConfig ? packageVersionExists(gitlabConfig, resourceName, version) : Promise.resolve(false),
      checkResourceExists(versionEntry.url),
    ]);
    if (!gitlabExists) {
      return { success: false, message: "Version does not exist in GitLab Package Registry" };
    }
    if (s3Result.status !== "available") {
      return { success: false, message: `S3 resource is not available (status: ${s3Result.status})` };
    }

    const updated = updater.setActiveVersion(registry, resourceName, version);
    await writeRegistryFile(this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async addResource(resourceName: string, version: string): Promise<MutationResult> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    if (Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
      return { success: false, message: `Resource "${resourceName}" already exists` };
    }

    const check = await this.checkCandidate(resourceName, version);
    if (!check.gitlabExists) {
      return { success: false, message: "Version does not exist in GitLab Package Registry" };
    }
    if (check.s3 !== "available") {
      return { success: false, message: `S3 resource is not available (status: ${check.s3})` };
    }

    const updated = updater.addResource(registry, resourceName, version, check.url);
    await writeRegistryFile(this.resolveJsonPath(config), updated);
    this.registry = updated;
    return { success: true };
  }

  async validate(): Promise<ValidationReport> {
    const config = getRepositoryConfig();
    const registry = await this.ensureRegistryLoaded(config);
    const gitlabConfig = await this.getGitLabConfig();

    return validateRegistry(registry, {
      s3BaseUrl: config.s3BaseUrl,
      entryFile: config.entryFile,
      checkS3: async (url) => (await checkResourceExists(url)).status === "available",
      packageExists: async (resourceName, version) =>
        gitlabConfig ? packageVersionExists(gitlabConfig, resourceName, version) : false,
    });
  }
}
