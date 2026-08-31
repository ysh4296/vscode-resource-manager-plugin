export interface ResourceVersion {
  url: string;
}

export interface ResourceConfig {
  /** GitLab project (path or numeric ID) that owns this MFE's own repo/Package Registry. */
  gitlabProject: string;
  current: string;
  versions: Record<string, ResourceVersion>;
}

export interface ResourceRegistry {
  resources: Record<string, ResourceConfig>;
}
