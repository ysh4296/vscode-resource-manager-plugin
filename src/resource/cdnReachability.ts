import { request } from "../util/http";

export interface CdnReachabilityResult {
  reachable: boolean;
  message?: string;
}

/**
 * Confirms a CDN/S3 base URL's host actually responds — not that any
 * specific version's file exists there (nothing checks that; the
 * resource's own package.json on GitLab is the sole source of truth for
 * "what version is live"). A 404 still counts as reachable since it proves
 * a server answered; only a connection failure counts as unreachable.
 */
export async function checkCdnReachable(baseUrl: string, timeoutMs = 8000): Promise<CdnReachabilityResult> {
  try {
    const headRes = await request(baseUrl, { method: "HEAD", timeoutMs });
    if (headRes.statusCode === 405 || headRes.statusCode === 501) {
      await request(baseUrl, { method: "GET", timeoutMs });
    }
    return { reachable: true };
  } catch (err) {
    return { reachable: false, message: err instanceof Error ? err.message : String(err) };
  }
}
