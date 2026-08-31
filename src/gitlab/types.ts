export interface GitLabConfig {
  baseUrl: string;
  projectPath: string;
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
