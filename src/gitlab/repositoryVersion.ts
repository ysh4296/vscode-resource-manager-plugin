import { buildApiUrl, encodeProjectId } from "./client";
import { request } from "../util/http";
import { GitLabConnection } from "./types";

interface GitLabProjectSummary {
  default_branch?: string;
}

/**
 * The sole signal for "what version is currently published" for a
 * resource: the `version` field of package.json on its GitLab project's
 * default branch — not a git tag, not a Package Registry entry. Mirrors
 * registry/deployHistory.ts's readRepositoryVersion, which reads the same
 * field locally for the managed repo itself.
 *
 * Returns undefined for any failure (project or file missing, bad JSON,
 * network/auth error) rather than throwing, so a misconfigured or
 * momentarily unreachable resource just doesn't get an auto-registered
 * version this round instead of breaking the whole refresh.
 */
export async function getRepositoryPackageVersion(
  connection: GitLabConnection,
  projectPath: string
): Promise<string | undefined> {
  try {
    const projectUrl = buildApiUrl(connection, `/projects/${encodeProjectId(projectPath)}`);
    const projectRes = await request(projectUrl, {
      headers: { "PRIVATE-TOKEN": connection.token, Accept: "application/json" },
    });
    if (projectRes.statusCode < 200 || projectRes.statusCode >= 300) {
      return undefined;
    }
    const project = JSON.parse(projectRes.body) as GitLabProjectSummary;
    if (!project.default_branch) {
      return undefined;
    }

    const fileUrl = buildApiUrl(connection, `/projects/${encodeProjectId(projectPath)}/repository/files/package.json/raw`, {
      ref: project.default_branch,
    });
    const fileRes = await request(fileUrl, { headers: { "PRIVATE-TOKEN": connection.token } });
    if (fileRes.statusCode < 200 || fileRes.statusCode >= 300) {
      return undefined;
    }

    const parsed = JSON.parse(fileRes.body) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}
