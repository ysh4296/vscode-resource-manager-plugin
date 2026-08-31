import assert from "node:assert/strict";
import { test } from "node:test";
import { ResourceRegistry } from "../registry/types";
import { buildDefaultCommitMessage, summarizeRegistryDiff } from "./diff";

function registryWith(resources: ResourceRegistry["resources"]): ResourceRegistry {
  return { resources };
}

test("summarizeRegistryDiff는 버전 추가와 활성 버전 변경을 함께 보고한다", () => {
  const before = registryWith({
    app1: { gitlabProject: "g/app1", current: "1.4.0", versions: { "1.4.0": { url: "http://x/1.4.0" } } },
  });
  const after = registryWith({
    app1: {
      gitlabProject: "g/app1",
      current: "1.5.0",
      versions: { "1.4.0": { url: "http://x/1.4.0" }, "1.5.0": { url: "http://x/1.5.0" } },
    },
  });

  const [summary] = summarizeRegistryDiff(before, after);
  assert.equal(summary.resourceName, "app1");
  assert.deepEqual(summary.currentChanged, { from: "1.4.0", to: "1.5.0" });
  assert.deepEqual(summary.addedVersions, ["1.5.0"]);
  assert.deepEqual(summary.removedVersions, []);
});

test("summarizeRegistryDiff는 변경되지 않은 리소스는 결과에서 빼놓는다", () => {
  const same = registryWith({
    app1: { gitlabProject: "g/app1", current: "1.0.0", versions: { "1.0.0": { url: "http://x" } } },
  });
  assert.deepEqual(summarizeRegistryDiff(same, same), []);
});

test("summarizeRegistryDiff는 새로 생긴 리소스(비교 대상이 없는 경우)도 처리한다", () => {
  const before = registryWith({});
  const after = registryWith({
    app2: { gitlabProject: "g/app2", current: "1.0.0", versions: { "1.0.0": { url: "http://x" } } },
  });

  const [summary] = summarizeRegistryDiff(before, after);
  assert.equal(summary.resourceName, "app2");
  assert.equal(summary.currentChanged, undefined); // 비교할 이전 상태가 없음
  assert.deepEqual(summary.addedVersions, ["1.0.0"]);
});

test("buildDefaultCommitMessage는 단일 활성화 변경이면 리소스명과 버전을 명시한다", () => {
  const message = buildDefaultCommitMessage([
    { resourceName: "app1", currentChanged: { from: "1.4.0", to: "1.5.0" }, addedVersions: [], removedVersions: [] },
  ]);
  assert.equal(message, "chore: update app1 to 1.5.0");
});

test("buildDefaultCommitMessage는 여러 리소스가 바뀌면 일반적인 메시지로 대체한다", () => {
  const message = buildDefaultCommitMessage([
    { resourceName: "app1", addedVersions: ["1.5.0"], removedVersions: [] },
    { resourceName: "app2", addedVersions: ["2.4.0"], removedVersions: [] },
  ]);
  assert.equal(message, "chore: update MFE resource versions");
});
