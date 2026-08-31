import * as fs from "fs/promises";
import * as path from "path";
import { ResourceRegistry } from "./types";

export interface DeploySnapshot {
  hostVersion: string;
  recordedAt: string;
  resources: Record<string, string>;
}

/**
 * The host version isn't looked up from GitLab — it's whatever the managed
 * repo's own package.json says. Returns undefined if there's no
 * package.json or no string `version` field, rather than throwing: a repo
 * without one just doesn't get automatic snapshots.
 */
export async function readRepositoryVersion(workspaceRoot: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(workspaceRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Captures which version of every resource is active right now, tagged
 * with the host version. Pure — takes the registry snapshot it should read
 * from, does no I/O.
 */
export function buildDeploySnapshot(hostVersion: string, registry: ResourceRegistry): DeploySnapshot {
  const resources: Record<string, string> = {};
  for (const [name, config] of Object.entries(registry.resources)) {
    resources[name] = config.current;
  }
  return { hostVersion, recordedAt: new Date().toISOString(), resources };
}

function snapshotFilePath(deployHistoryDir: string, hostVersion: string): string {
  return path.join(deployHistoryDir, `${hostVersion}.json`);
}

export async function writeDeploySnapshot(deployHistoryDir: string, snapshot: DeploySnapshot): Promise<string> {
  await fs.mkdir(deployHistoryDir, { recursive: true });
  const filePath = snapshotFilePath(deployHistoryDir, snapshot.hostVersion);
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return filePath;
}

/** Newest-first by recordedAt. Missing directory or unreadable files are skipped, not errors. */
export async function listDeploySnapshots(deployHistoryDir: string): Promise<DeploySnapshot[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(deployHistoryDir);
  } catch {
    return [];
  }

  const snapshots: DeploySnapshot[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(deployHistoryDir, entry), "utf8");
      snapshots.push(JSON.parse(raw) as DeploySnapshot);
    } catch {
      // Skip a corrupt or unreadable snapshot file rather than failing the whole list.
    }
  }

  snapshots.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  return snapshots;
}
