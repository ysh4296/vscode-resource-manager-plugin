export interface ParsedMicroserviceUrl {
  /** Protocol + host (+ port) — the GitLab instance this project lives on. */
  baseUrl: string;
  /** The project's path within that instance, e.g. "frontend/app1". */
  projectPath: string;
}

/**
 * Splits a microservice's full GitLab project URL (e.g.
 * "https://gitlab.example.com/frontend/app1") into the instance base URL
 * and the project path. Each resource carries its own full URL instead of
 * relying on one global GitLab instance setting, since different MFEs in
 * the same registry can genuinely live on different GitLab instances.
 *
 * Doesn't account for a GitLab instance mounted under a sub-path
 * (relative_url_root) — the whole path after the host is treated as the
 * project path.
 */
export function parseMicroserviceUrl(microserviceUrl: string): ParsedMicroserviceUrl {
  let parsed: URL;
  try {
    parsed = new URL(microserviceUrl);
  } catch {
    throw new Error(`"${microserviceUrl}" is not a valid URL`);
  }

  const projectPath = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (projectPath.length === 0) {
    throw new Error(`"${microserviceUrl}" is missing a project path`);
  }

  return { baseUrl: parsed.origin, projectPath };
}
