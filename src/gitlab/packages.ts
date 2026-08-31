import * as semver from "semver";
import { encodeProjectId, getPaginated } from "./client";
import { GitLabConnection, GitLabPackage, PackageVersionInfo } from "./types";

/**
 * Lists every package published in a project's own Package Registry. Each
 * MFE lives in its own repo, so no package_name filter is applied — a
 * dedicated project's registry is assumed to hold only that MFE's
 * packages.
 */
export async function listPackages(connection: GitLabConnection, projectPath: string): Promise<GitLabPackage[]> {
  return getPaginated<GitLabPackage>(connection, `/projects/${encodeProjectId(projectPath)}/packages`);
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

export async function listPackageVersions(
  connection: GitLabConnection,
  projectPath: string
): Promise<PackageVersionInfo[]> {
  const packages = await listPackages(connection, projectPath);

  const byVersion = new Map<string, PackageVersionInfo>();
  for (const pkg of packages) {
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
  connection: GitLabConnection,
  projectPath: string,
  version: string
): Promise<boolean> {
  const versions = await listPackageVersions(connection, projectPath);
  return versions.some((v) => v.version === version);
}
