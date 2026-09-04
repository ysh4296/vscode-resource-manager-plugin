export interface ResourceVersion {
  url: string;
}

export interface ResourceConfig {
  /**
   * This MFE's own GitLab project, as a full URL (e.g.
   * "https://gitlab.example.com/frontend/app1") — not just a project
   * path, since different resources can live on entirely different GitLab
   * instances. Split into instance + project path via
   * gitlab/projectUrl.ts.
   */
  microserviceUrl: string;
  /** CDN/S3 base URL this resource's files are served from. Mapped per-resource — different MFEs can live on different CDNs/buckets. */
  cdnBaseUrl: string;
  current: string;
  versions: Record<string, ResourceVersion>;
}

export interface ResourceRegistry {
  resources: Record<string, ResourceConfig>;
}
