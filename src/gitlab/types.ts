/**
 * Just the GitLab instance + auth. Which project to query is per-resource
 * (each MFE lives in its own repo), not part of this connection — see
 * ResourceConfig.gitlabProject.
 */
export interface GitLabConnection {
  baseUrl: string;
  token: string;
}

export interface GitLabPackage {
  id: number;
  name: string;
  version: string;
  package_type: string;
  created_at: string;
}

/**
 * A single version of a named package, annotated with whether it parses as
 * valid SemVer (used for sorting and for display).
 */
export interface PackageVersionInfo {
  version: string;
  createdAt: string;
  isSemver: boolean;
}
