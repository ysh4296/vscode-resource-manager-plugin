import { URL } from "url";
import { request } from "../util/http";
import { GitLabConnection } from "./types";

export function encodeProjectId(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export function buildApiUrl(connection: GitLabConnection, path: string, query: Record<string, string> = {}): string {
  const base = connection.baseUrl.trim().replace(/\/+$/, "");
  const url = new URL(`${base}/api/v4${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function testConnection(
  connection: GitLabConnection,
  projectPath: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = buildApiUrl(connection, `/projects/${encodeProjectId(projectPath)}`);
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
