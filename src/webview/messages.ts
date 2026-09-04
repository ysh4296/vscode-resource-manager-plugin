import type { ResourceChangeSummary } from "../git/diff";
import type { ValidationReport } from "../registry/validator";

/**
 * Shared message contract between the extension host and the webview.
 * Both sides import this module — it must stay free of Node-only runtime
 * imports (only `import type` for cross-module types) so it can be bundled
 * into the browser-side webview code as well.
 */

export interface RepositoryConfigDTO {
  repositoryUrl: string;
  jsonPath: string;
  entryFile: string;
  hasToken: boolean;
}

export interface ResourceVersionStatus {
  version: string;
  url: string;
  gitlab: "checking" | "yes" | "no" | "error";
}

export interface ResourceViewModel {
  name: string;
  /** Full URL of this resource's own GitLab project, e.g. "https://gitlab.example.com/frontend/app1". */
  microserviceUrl: string;
  /** CDN/S3 base URL this resource's files are served from. */
  cdnBaseUrl: string;
  current: string;
  versions: ResourceVersionStatus[];
}

export interface AutoRegisteredVersion {
  resourceName: string;
  version: string;
}

export interface AppState {
  config: RepositoryConfigDTO;
  configComplete: boolean;
  resources: ResourceViewModel[];
  loadError?: string;
  /** Versions that were just auto-registered as part of this getState() call (see registryService.autoRegisterNewVersions). */
  autoRegistered?: AutoRegisteredVersion[];
  /** Host version a deploy-history snapshot was just auto-recorded for, if any (see registryService.autoRecordDeploySnapshot). */
  autoSnapshotRecorded?: string;
}

export interface RemoteStatus {
  diverged: boolean;
  ahead: number;
  behind: number;
  message: string;
}

export interface DeploySnapshot {
  hostVersion: string;
  recordedAt: string;
  resources: Record<string, string>;
}

export type WebviewRequest =
  | { type: "getState" }
  | { type: "saveConfig"; config: Omit<RepositoryConfigDTO, "hasToken"> }
  | { type: "saveToken"; token: string }
  | { type: "setResourceLocation"; resourceName: string; microserviceUrl: string; cdnBaseUrl: string }
  | { type: "addResource"; resourceName: string; microserviceUrl: string; cdnBaseUrl: string }
  | { type: "removeResource"; resourceName: string }
  | { type: "validate" }
  | { type: "getDiff" }
  | { type: "commit"; message: string }
  | { type: "checkRemoteStatus" }
  | { type: "push" }
  | { type: "getDeployHistory" };

export type ExtensionResponse =
  | { type: "state"; state: AppState }
  | { type: "error"; requestType: WebviewRequest["type"]; message: string }
  | { type: "setResourceLocationResult"; success: boolean; message?: string; state?: AppState }
  | { type: "addResourceResult"; success: boolean; message?: string; state?: AppState }
  | { type: "removeResourceResult"; success: boolean; message?: string; state?: AppState }
  | { type: "validationResult"; report: ValidationReport }
  | { type: "diffResult"; diff: string; summary: ResourceChangeSummary[]; defaultCommitMessage: string }
  | { type: "commitResult"; success: boolean; message?: string }
  | { type: "remoteStatusResult"; status: RemoteStatus }
  | { type: "pushResult"; success: boolean; message?: string; blocked?: boolean }
  | { type: "deployHistoryResult"; snapshots: DeploySnapshot[] };
