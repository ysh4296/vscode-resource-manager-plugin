/**
 * Just the GitLab instance + auth. Which project to query is per-resource
 * (each MFE lives in its own repo), not part of this connection — see
 * ResourceConfig.microserviceUrl.
 */
export interface GitLabConnection {
  baseUrl: string;
  token: string;
}
