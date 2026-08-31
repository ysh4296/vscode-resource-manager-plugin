import { request } from "../util/http";

export type ResourceStatus = "idle" | "checking" | "available" | "missing" | "error";

export interface ResourceCheckResult {
  status: ResourceStatus;
  httpStatus?: number;
  error?: string;
}

const METHOD_NOT_SUPPORTED = new Set([405, 501]);

function toResult(statusCode: number): ResourceCheckResult {
  if (statusCode >= 200 && statusCode < 300) {
    return { status: "available", httpStatus: statusCode };
  }
  if (statusCode === 404) {
    return { status: "missing", httpStatus: statusCode };
  }
  return { status: "error", httpStatus: statusCode, error: `Unexpected HTTP status ${statusCode}` };
}

/**
 * Verifies a generated S3 (or CDN-fronted S3) resource URL actually exists.
 * HEAD is tried first; if the server doesn't support HEAD (405/501), falls
 * back to GET. Network failures are reported as "error", distinct from a
 * confirmed 404 ("missing").
 */
export async function checkResourceExists(url: string, timeoutMs = 10000): Promise<ResourceCheckResult> {
  try {
    const headRes = await request(url, { method: "HEAD", timeoutMs });
    if (METHOD_NOT_SUPPORTED.has(headRes.statusCode)) {
      const getRes = await request(url, { method: "GET", timeoutMs });
      return toResult(getRes.statusCode);
    }
    return toResult(headRes.statusCode);
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
