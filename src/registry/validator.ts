import { parseMicroserviceUrl } from "../gitlab/projectUrl";
import { buildResourceUrl } from "../resource/buildResourceUrl";
import { ResourceConfig, ResourceRegistry } from "./types";

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  message?: string;
}

export interface ValidationReport {
  checks: ValidationCheck[];
  ok: boolean;
}

/**
 * External checks are injected rather than performed inline, so the
 * structural rules in this module stay pure functions that unit tests can
 * call without a network or GitLab token.
 */
export interface ValidationContext {
  entryFile: string;
  /**
   * Whether `version` is currently the version published in this resource's
   * own package.json on GitLab. GitLab only ever reports one "live" version
   * per resource (there's no package registry history to check against), so
   * this can only ever confirm the resource's `current` version — see
   * validateRegistry below.
   */
  isCurrentVersion: (microserviceUrl: string, version: string) => Promise<boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateRegistryStructure(data: unknown): ValidationCheck[] {
  const structureOk = isRecord(data) && isRecord((data as { resources?: unknown }).resources);
  return [
    {
      id: "structure",
      label: "JSON Structure",
      passed: structureOk,
      message: structureOk ? undefined : 'Missing or invalid top-level "resources" object',
    },
  ];
}

export function validateResource(resourceName: string, config: ResourceConfig): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const hasMicroserviceUrl = typeof config?.microserviceUrl === "string" && config.microserviceUrl.length > 0;
  checks.push({
    id: `${resourceName}:microservice-url-field`,
    label: `${resourceName} has "microserviceUrl"`,
    passed: hasMicroserviceUrl,
    message: hasMicroserviceUrl ? undefined : 'Missing or empty "microserviceUrl" field',
  });

  const hasCdnBaseUrl = typeof config?.cdnBaseUrl === "string" && config.cdnBaseUrl.length > 0;
  checks.push({
    id: `${resourceName}:cdn-base-url-field`,
    label: `${resourceName} has "cdnBaseUrl"`,
    passed: hasCdnBaseUrl,
    message: hasCdnBaseUrl ? undefined : 'Missing or empty "cdnBaseUrl" field',
  });

  const hasCurrent = typeof config?.current === "string" && config.current.length > 0;
  checks.push({
    id: `${resourceName}:current-field`,
    label: `${resourceName} has "current"`,
    passed: hasCurrent,
    message: hasCurrent ? undefined : 'Missing or empty "current" field',
  });

  const hasVersions = isRecord(config?.versions);
  checks.push({
    id: `${resourceName}:versions-field`,
    label: `${resourceName} has "versions"`,
    passed: hasVersions,
    message: hasVersions ? undefined : 'Missing or invalid "versions" object',
  });

  if (hasCurrent && hasVersions) {
    const currentRegistered = Object.prototype.hasOwnProperty.call(config.versions, config.current);
    checks.push({
      id: `${resourceName}:current-in-versions`,
      label: `${resourceName}@${config.current} current is registered`,
      passed: currentRegistered,
      message: currentRegistered ? undefined : `"current" version "${config.current}" is not present in "versions"`,
    });
  }

  return checks;
}

export function validateVersion(
  resourceName: string,
  microserviceUrl: string,
  cdnBaseUrl: string,
  version: string,
  url: string,
  entryFile: string
): ValidationCheck {
  const id = `${resourceName}@${version}:url-rule`;
  const label = `${resourceName}@${version} URL matches rule`;

  let expected: string;
  try {
    const { projectPath } = parseMicroserviceUrl(microserviceUrl);
    expected = buildResourceUrl({ baseUrl: cdnBaseUrl, projectPath, version, entryFile });
  } catch (err) {
    return { id, label, passed: false, message: (err as Error).message };
  }

  const passed = url === expected;
  return { id, label, passed, message: passed ? undefined : `Expected "${expected}", got "${url}"` };
}

/**
 * JSON.parse silently collapses literal duplicate keys, so true duplicates
 * in the source text can't be detected after parsing. This instead catches
 * near-duplicates (case/whitespace variants) that would indicate the same
 * version was registered twice by mistake.
 */
export function validateNoDuplicateVersions(resourceName: string, config: ResourceConfig): ValidationCheck {
  const keys = Object.keys(config?.versions ?? {});
  const normalized = keys.map((k) => k.trim().toLowerCase());
  const passed = new Set(normalized).size === normalized.length;
  return {
    id: `${resourceName}:no-duplicate-versions`,
    label: `${resourceName} has no duplicate versions`,
    passed,
    message: passed ? undefined : "Two or more version keys collide when compared case-insensitively",
  };
}

export async function validateGitLabCurrentVersion(
  resourceName: string,
  microserviceUrl: string,
  version: string,
  isCurrentVersion: (microserviceUrl: string, version: string) => Promise<boolean>
): Promise<ValidationCheck> {
  const matches = await isCurrentVersion(microserviceUrl, version);
  return {
    id: `${resourceName}@${version}:gitlab`,
    label: `${resourceName}@${version} matches GitLab`,
    passed: matches,
    message: matches ? undefined : "Does not match the version currently published in this resource's package.json on GitLab",
  };
}

/**
 * Full pre-save / pre-push validation pass. Checks, in order:
 *  1. JSON structure
 *  2. each resource's `current` is present in its `versions`
 *  3. each version's URL matches the buildResourceUrl rule
 *  4. the resource's `current` version still matches what GitLab reports
 *  5. no duplicate version keys
 *  6. required fields are present (folded into checks 1-2 above)
 *
 * The resource's own package.json on GitLab is the sole source of truth
 * for "what version is live" — it only ever reports one version, so older
 * entries in `versions` are historical record (like deploy-history) and
 * aren't re-verified against GitLab here, only `current` is. CDN is just
 * where the artifact happens to be uploaded, so it's not re-verified either.
 */
export async function validateRegistry(registry: ResourceRegistry, ctx: ValidationContext): Promise<ValidationReport> {
  const checks: ValidationCheck[] = [...validateRegistryStructure(registry)];

  for (const [resourceName, config] of Object.entries(registry.resources)) {
    checks.push(...validateResource(resourceName, config));
    checks.push(validateNoDuplicateVersions(resourceName, config));

    for (const [version, versionConfig] of Object.entries(config.versions ?? {})) {
      checks.push(
        validateVersion(resourceName, config.microserviceUrl, config.cdnBaseUrl, version, versionConfig.url, ctx.entryFile)
      );
    }

    if (config.current) {
      checks.push(await validateGitLabCurrentVersion(resourceName, config.microserviceUrl, config.current, ctx.isCurrentVersion));
    }
  }

  return { checks, ok: checks.every((c) => c.passed) };
}
