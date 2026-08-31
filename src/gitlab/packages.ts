import * as semver from "semver";
import { encodeProjectId, getPaginated } from "./client";
import { GitLabConfig, GitLabPackage, PackageVersionInfo } from "./types";

export async function listPackages(config: GitLabConfig, packageName?: string): Promise<GitLabPackage[]> {
  const query: Record<string, string> = {};
  if (packageName) {
    query.package_name = packageName;
  }
  return getPaginated<GitLabPackage>(config, `/projects/${encodeProjectId(config.projectPath)}/packages`, query);
}

export function listPackageNames(packages: GitLabPackage[]): string[] {
  return Array.from(new Set(packages.map((p) => p.name))).sort((a, b) => a.localeCompare(b));
}

/**
 * SemVer-valid versions sort first (newest to oldest); anything that isn't
 * valid SemVer is appended afterwards, newest-created first. Never falls
 * back to plain string sorting for SemVer versions.
 */
export function sortPackageVersions(versions: PackageVersionInfo[]): PackageVersionInfo[] {
  const semverVersions = versions.filter((v) => v.isSemver).sort((a, b) => semver.rcompare(a.version, b.version));
  const nonSemverVersions = versions
    .filter((v) => !v.isSemver)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return [...semverVersions, ...nonSemverVersions];
}

export async function listPackageVersions(config: GitLabConfig, packageName: string): Promise<PackageVersionInfo[]> {
  const packages = await listPackages(config, packageName);
  const matching = packages.filter((p) => p.name === packageName);

  const byVersion = new Map<string, PackageVersionInfo>();
  for (const pkg of matching) {
    const info: PackageVersionInfo = {
      version: pkg.version,
      createdAt: pkg.created_at,
      isSemver: semver.valid(pkg.version) !== null,
    };
    const existing = byVersion.get(info.version);
    if (!existing || new Date(info.createdAt) > new Date(existing.createdAt)) {
      byVersion.set(info.version, info);
    }
  }

  return sortPackageVersions(Array.from(byVersion.values()));
}

export async function packageVersionExists(
  config: GitLabConfig,
  packageName: string,
  version: string
): Promise<boolean> {
  const versions = await listPackageVersions(config, packageName);
  return versions.some((v) => v.version === version);
}
