export interface BuildResourceUrlOptions {
  baseUrl: string;
  resourceName: string;
  version: string;
  entryFile: string;
}

/**
 * Single source of truth for how an S3 resource URL is composed.
 * No other module should concatenate these parts by hand.
 */
export function buildResourceUrl(options: BuildResourceUrlOptions): string {
  const base = options.baseUrl.trim().replace(/\/+$/, "");
  const segments = [options.resourceName, options.version, options.entryFile].map((segment) =>
    segment.trim().replace(/^\/+|\/+$/g, "")
  );

  for (const [index, segment] of segments.entries()) {
    if (segment.length === 0) {
      const field = ["resourceName", "version", "entryFile"][index];
      throw new Error(`buildResourceUrl: "${field}" must not be empty`);
    }
  }

  return [base, ...segments].join("/");
}
