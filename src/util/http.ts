import * as http from "http";
import * as https from "https";
import { URL } from "url";

export interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface HttpRequestOptions {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
}

/**
 * Minimal dependency-free HTTP(S) client built on Node's core modules.
 * Avoids relying on global fetch, whose availability varies across the
 * Node versions VS Code's extension host may bundle.
 */
export function request(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const attempt = (targetUrl: string, redirectsLeft: number): void => {
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        parsed,
        {
          method: options.method ?? "GET",
          headers: options.headers,
          timeout: options.timeoutMs ?? 10000,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = res.headers.location;
          if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
            res.resume();
            const nextUrl = new URL(location, targetUrl).toString();
            attempt(nextUrl, redirectsLeft - 1);
            return;
          }

          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              statusCode: status,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
          res.on("error", reject);
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error(`Request to ${targetUrl} timed out`));
      });
      req.on("error", reject);
      req.end();
    };

    attempt(url, options.maxRedirects ?? 5);
  });
}

export class HttpStatusError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly url: string,
    public readonly body: string
  ) {
    super(`HTTP ${statusCode} for ${url}`);
    this.name = "HttpStatusError";
  }
}

export async function requestJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const res = await request(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers ?? {}) },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new HttpStatusError(res.statusCode, url, res.body);
  }
  try {
    return JSON.parse(res.body) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON response from ${url}: ${(err as Error).message}`);
  }
}
