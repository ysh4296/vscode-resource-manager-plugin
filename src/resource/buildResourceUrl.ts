export interface BuildResourceUrlOptions {
  baseUrl: string;
  /** The MFE's GitLab project path (e.g. "frontend/app1", from parsing its microserviceUrl) — the CDN path mirrors this, not the internal resource name/key. */
  projectPath: string;
  version: string;
  entryFile: string;
}

/**
 * Single source of truth for how a CDN resource URL is composed.
 * No other module should concatenate these parts by hand.
 *
 * The path is baseUrl/<projectPath segments>/version/entryFile — a
 * projectPath like "frontend/app1" expands to two path segments
 * ("frontend", "app1"), mirroring the project's own GitLab location rather
 * than whatever key the resource happens to be stored under.
 */
export function buildResourceUrl(options: BuildResourceUrlOptions): string {
  const base = options.baseUrl.trim().replace(/\/+$/, "");

  const projectSegments = options.projectPath
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (projectSegments.length === 0) {
    throw new Error('buildResourceUrl: "projectPath" must not be empty');
  }

  const version = options.version.trim().replace(/^\/+|\/+$/g, "");
  if (version.length === 0) {
    throw new Error('buildResourceUrl: "version" must not be empty');
  }

  const entryFile = options.entryFile.trim().replace(/^\/+|\/+$/g, "");
  if (entryFile.length === 0) {
    throw new Error('buildResourceUrl: "entryFile" must not be empty');
  }

  return [base, ...projectSegments, version, entryFile].join("/");
}
