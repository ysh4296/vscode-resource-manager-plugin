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
  s3BaseUrl: string;
  entryFile: string;
  checkS3: (url: string) => Promise<boolean>;
  packageExists: (resourceName: string, version: string) => Promise<boolean>;
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
  version: string,
  url: string,
  s3BaseUrl: string,
  entryFile: string
): ValidationCheck {
  const id = `${resourceName}@${version}:url-rule`;
  const label = `${resourceName}@${version} URL matches rule`;

  let expected: string;
  try {
    expected = buildResourceUrl({ baseUrl: s3BaseUrl, resourceName, version, entryFile });
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

export async function validateS3Resource(
  resourceName: string,
  version: string,
  url: string,
  checkS3: (url: string) => Promise<boolean>
): Promise<ValidationCheck> {
  const available = await checkS3(url);
  return {
    id: `${resourceName}@${version}:s3`,
    label: `${resourceName}@${version} S3 Resource`,
    passed: available,
    message: available ? undefined : "S3 resource not accessible",
  };
}

export async function validateGitLabPackage(
  resourceName: string,
  version: string,
  packageExists: (resourceName: string, version: string) => Promise<boolean>
): Promise<ValidationCheck> {
  const exists = await packageExists(resourceName, version);
  return {
    id: `${resourceName}@${version}:gitlab`,
    label: `${resourceName}@${version} GitLab Package`,
    passed: exists,
    message: exists ? undefined : "Version not found in GitLab Package Registry",
  };
}

/**
 * Full pre-save / pre-push validation pass. Checks, in order:
 *  1. JSON structure
 *  2. each resource's `current` is present in its `versions`
 *  3. each version's URL matches the buildResourceUrl rule
 *  4. the *active* version's S3 resource is reachable
 *  5. every *registered* version still exists in GitLab Package Registry
 *  6. no duplicate version keys
 *  7. required fields are present (folded into checks 1-2 above)
 */
export async function validateRegistry(registry: ResourceRegistry, ctx: ValidationContext): Promise<ValidationReport> {
  const checks: ValidationCheck[] = [...validateRegistryStructure(registry)];

  for (const [resourceName, config] of Object.entries(registry.resources)) {
    checks.push(...validateResource(resourceName, config));
    checks.push(validateNoDuplicateVersions(resourceName, config));

    for (const [version, versionConfig] of Object.entries(config.versions ?? {})) {
      checks.push(validateVersion(resourceName, version, versionConfig.url, ctx.s3BaseUrl, ctx.entryFile));
      checks.push(await validateGitLabPackage(resourceName, version, ctx.packageExists));
    }

    const activeVersion = config.versions?.[config.current];
    if (activeVersion) {
      checks.push(await validateS3Resource(resourceName, config.current, activeVersion.url, ctx.checkS3));
    }
  }

  return { checks, ok: checks.every((c) => c.passed) };
}
