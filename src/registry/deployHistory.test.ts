import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { ResourceRegistry } from "./types";
import { buildDeploySnapshot, listDeploySnapshots, readRepositoryVersion, writeDeploySnapshot } from "./deployHistory";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "deploy-history-test-"));
}

test("buildDeploySnapshot은 모든 리소스의 현재 버전을 호스트 버전과 함께 담는다", () => {
  const registry: ResourceRegistry = {
    resources: {
      app1: { microserviceUrl: "https://gitlab.example.com/g/app1", cdnBaseUrl: "http://x", current: "1.5.0", versions: {} },
      app2: { microserviceUrl: "https://gitlab.example.com/g/app2", cdnBaseUrl: "http://x", current: "2.3.0", versions: {} },
    },
  };

  const snapshot = buildDeploySnapshot("2.1.0", registry);
  assert.equal(snapshot.hostVersion, "2.1.0");
  assert.deepEqual(snapshot.resources, { app1: "1.5.0", app2: "2.3.0" });
  assert.ok(!Number.isNaN(new Date(snapshot.recordedAt).getTime()));
});

test("writeDeploySnapshot과 listDeploySnapshots는 파일시스템을 거쳐 최신순으로 왕복된다", async () => {
  const dir = await tmpDir();
  try {
    await writeDeploySnapshot(dir, { hostVersion: "1.0.0", recordedAt: "2026-01-01T00:00:00.000Z", resources: { app1: "1.0.0" } });
    await writeDeploySnapshot(dir, { hostVersion: "2.0.0", recordedAt: "2026-02-01T00:00:00.000Z", resources: { app1: "1.1.0" } });

    const snapshots = await listDeploySnapshots(dir);
    assert.deepEqual(
      snapshots.map((s) => s.hostVersion),
      ["2.0.0", "1.0.0"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("listDeploySnapshots는 폴더가 아직 없어도 에러 대신 빈 목록을 반환한다", async () => {
  const snapshots = await listDeploySnapshots(path.join(os.tmpdir(), "does-not-exist-" + Date.now()));
  assert.deepEqual(snapshots, []);
});

test("listDeploySnapshots는 손상된 스냅샷 파일 하나 때문에 전체 목록 조회가 실패하지 않는다", async () => {
  const dir = await tmpDir();
  try {
    await fs.writeFile(path.join(dir, "corrupt.json"), "{ not valid json", "utf8");
    await writeDeploySnapshot(dir, { hostVersion: "1.0.0", recordedAt: "2026-01-01T00:00:00.000Z", resources: {} });

    const snapshots = await listDeploySnapshots(dir);
    assert.deepEqual(
      snapshots.map((s) => s.hostVersion),
      ["1.0.0"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("readRepositoryVersion은 package.json의 version 필드를 읽고, 없거나 잘못됐으면 undefined를 반환한다", async () => {
  const dir = await tmpDir();
  try {
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ version: "3.2.1" }), "utf8");
    assert.equal(await readRepositoryVersion(dir), "3.2.1");

    const noPackageJsonDir = await tmpDir();
    assert.equal(await readRepositoryVersion(noPackageJsonDir), undefined);
    await fs.rm(noPackageJsonDir, { recursive: true, force: true });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
