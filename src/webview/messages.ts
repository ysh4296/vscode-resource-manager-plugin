import type { ResourceChangeSummary } from "../git/diff";
import type { ResourceStatus } from "../resource/validateResource";
import type { ValidationReport } from "../registry/validator";

/**
 * Shared message contract between the extension host and the webview.
 * Both sides import this module — it must stay free of Node-only runtime
 * imports (only `import type` for cross-module types) so it can be bundled
 * into the browser-side webview code as well.
 */

export interface RepositoryConfigDTO {
  gitlabUrl: string;
  projectPath: string;
  jsonPath: string;
  s3BaseUrl: string;
  entryFile: string;
  hasToken: boolean;
}

export interface ResourceVersionStatus {
  version: string;
  url: string;
  gitlab: "checking" | "yes" | "no" | "error";
  s3: ResourceStatus;
}

export interface ResourceViewModel {
  name: string;
  current: string;
  versions: ResourceVersionStatus[];
}

export interface AppState {
  config: RepositoryConfigDTO;
  configComplete: boolean;
  resources: ResourceViewModel[];
  loadError?: string;
}

export interface PackageVersionOption {
  version: string;
  isSemver: boolean;
  alreadyRegistered: boolean;
  generatedUrl: string;
}

export interface CandidateCheckResult {
  resourceName: string;
  version: string;
  url: string;
  gitlabExists: boolean;
  s3: ResourceStatus;
}

export interface RemoteStatus {
  diverged: boolean;
  ahead: number;
  behind: number;
  message: string;
}

export type WebviewRequest =
  | { type: "getState" }
  | { type: "saveConfig"; config: Omit<RepositoryConfigDTO, "hasToken"> }
  | { type: "saveToken"; token: string }
  | { type: "getPackageVersions"; resourceName: string }
  | { type: "checkCandidate"; resourceName: string; version: string }
  | { type: "registerVersion"; resourceName: string; version: string }
  | { type: "setActiveVersion"; resourceName: string; version: string }
  | { type: "addResource"; resourceName: string; version: string }
  | { type: "validate" }
  | { type: "getDiff" }
  | { type: "commit"; message: string }
  | { type: "checkRemoteStatus" }
  | { type: "push" };

export type ExtensionResponse =
  | { type: "state"; state: AppState }
  | { type: "error"; requestType: WebviewRequest["type"]; message: string }
  | { type: "packageVersions"; resourceName: string; versions: PackageVersionOption[] }
  | { type: "candidateCheckResult"; result: CandidateCheckResult }
  | { type: "registerVersionResult"; success: boolean; message?: string; state?: AppState }
  | { type: "setActiveVersionResult"; success: boolean; message?: string; state?: AppState }
  | { type: "addResourceResult"; success: boolean; message?: string; state?: AppState }
  | { type: "validationResult"; report: ValidationReport }
  | { type: "diffResult"; diff: string; summary: ResourceChangeSummary[]; defaultCommitMessage: string }
  | { type: "commitResult"; success: boolean; message?: string }
  | { type: "remoteStatusResult"; status: RemoteStatus }
  | { type: "pushResult"; success: boolean; message?: string; blocked?: boolean };
