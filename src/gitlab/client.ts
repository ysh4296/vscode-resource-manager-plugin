import { URL } from "url";
import { request } from "../util/http";
import { GitLabConnection } from "./types";

export class GitLabApiError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "GitLabApiError";
  }
}

export function encodeProjectId(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

function buildUrl(connection: GitLabConnection, path: string, query: Record<string, string> = {}): string {
  const base = connection.baseUrl.trim().replace(/\/+$/, "");
  const url = new URL(`${base}/api/v4${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function parseNextLink(linkHeader: string | undefined): string | undefined {
  if (!linkHeader) {
    return undefined;
  }
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === "next") {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Fetches every page of a GitLab list endpoint. Always requests per_page=100
 * and follows the Link "next" header rather than assuming a single page is
 * the full result set.
 */
export async function getPaginated<T>(
  connection: GitLabConnection,
  path: string,
  query: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined = buildUrl(connection, path, { per_page: "100", ...query });

  while (nextUrl) {
    const res = await request(nextUrl, {
      headers: { "PRIVATE-TOKEN": connection.token, Accept: "application/json" },
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new GitLabApiError(`GitLab API request failed (${res.statusCode}): ${res.body}`, res.statusCode);
    }

    let page: T[];
    try {
      page = JSON.parse(res.body) as T[];
    } catch (err) {
      throw new GitLabApiError(`Failed to parse GitLab API response as JSON: ${(err as Error).message}`);
    }

    results.push(...page);
    const linkHeader = res.headers.link;
    nextUrl = parseNextLink(typeof linkHeader === "string" ? linkHeader : undefined);
  }

  return results;
}

export async function testConnection(
  connection: GitLabConnection,
  projectPath: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = buildUrl(connection, `/projects/${encodeProjectId(projectPath)}`);
    const res = await request(url, {
      headers: { "PRIVATE-TOKEN": connection.token, Accept: "application/json" },
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, message: "Connected" };
    }
    return { ok: false, message: `GitLab responded with ${res.statusCode}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
