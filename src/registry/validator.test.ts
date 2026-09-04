import assert from "node:assert/strict";
import { test } from "node:test";
import { ResourceRegistry } from "./types";
import {
  validateNoDuplicateVersions,
  validateRegistry,
  validateRegistryStructure,
  validateResource,
  validateVersion,
} from "./validator";

const MICROSERVICE_URL = "https://gitlab.example.com/frontend/app1";
const CDN_BASE_URL = "https://cdn.example.com";
const ENTRY_FILE = "remoteEntry.js";

function registry(): ResourceRegistry {
  return {
    resources: {
      app1: {
        microserviceUrl: MICROSERVICE_URL,
        cdnBaseUrl: CDN_BASE_URL,
        current: "1.4.0",
        versions: {
          "1.4.0": { url: "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js" },
        },
      },
    },
  };
}

test("validateRegistryStructure는 최상위 resources 객체가 있어야 통과한다", () => {
  assert.equal(validateRegistryStructure({ resources: {} })[0].passed, true);
  assert.equal(validateRegistryStructure({})[0].passed, false);
  assert.equal(validateRegistryStructure(null)[0].passed, false);
  assert.equal(validateRegistryStructure("not an object")[0].passed, false);
});

test("validateResource는 microserviceUrl/cdnBaseUrl 누락, current 누락, current가 versions에 없는 경우를 각각 잡아낸다", () => {
  const checks = validateResource("app1", {
    microserviceUrl: "",
    cdnBaseUrl: "",
    current: "2.0.0",
    versions: { "1.0.0": { url: "http://x" } },
  });

  const byId = Object.fromEntries(checks.map((c) => [c.id, c.passed]));
  assert.equal(byId["app1:microservice-url-field"], false);
  assert.equal(byId["app1:cdn-base-url-field"], false);
  assert.equal(byId["app1:current-field"], true); // "2.0.0"은 비어있지 않은 문자열이라 통과
  assert.equal(byId["app1:current-in-versions"], false); // 하지만 등록된 버전이 아님
});

test("validateResource는 정상적인 리소스에 대해 모든 체크를 통과시킨다", () => {
  const checks = validateResource("app1", registry().resources.app1);
  assert.ok(checks.every((c) => c.passed));
});

test("validateVersion은 저장된 URL을 buildResourceUrl 규칙(microserviceUrl에서 뽑아낸 projectPath 기준)과 비교한다", () => {
  const ok = validateVersion(
    "app1",
    MICROSERVICE_URL,
    CDN_BASE_URL,
    "1.4.0",
    "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js",
    ENTRY_FILE
  );
  assert.equal(ok.passed, true);

  const stale = validateVersion(
    "app1",
    MICROSERVICE_URL,
    CDN_BASE_URL,
    "1.4.0",
    "https://old-cdn.example.com/frontend/app1/1.4.0/remoteEntry.js",
    ENTRY_FILE
  );
  assert.equal(stale.passed, false);
});

test("validateVersion은 microserviceUrl 자체가 잘못된 URL이면 실패로 처리한다", () => {
  const invalid = validateVersion(
    "app1",
    "not-a-valid-url",
    CDN_BASE_URL,
    "1.4.0",
    "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js",
    ENTRY_FILE
  );
  assert.equal(invalid.passed, false);
});

test("validateNoDuplicateVersions는 JSON.parse로는 못 잡는 대소문자/공백 충돌을 잡아낸다", () => {
  const clean = validateNoDuplicateVersions("app1", {
    microserviceUrl: MICROSERVICE_URL,
    cdnBaseUrl: CDN_BASE_URL,
    current: "1.0.0",
    versions: { "1.0.0": { url: "http://x" }, "2.0.0": { url: "http://y" } },
  });
  assert.equal(clean.passed, true);

  const colliding = validateNoDuplicateVersions("app1", {
    microserviceUrl: MICROSERVICE_URL,
    cdnBaseUrl: CDN_BASE_URL,
    current: "1.0.0",
    versions: { "1.0.0": { url: "http://x" }, " 1.0.0": { url: "http://y" } },
  });
  assert.equal(colliding.passed, false);
});

test("validateRegistry는 모든 체크를 합치고, 하나라도 실패하면 전체를 실패로 판정한다", async () => {
  const passing = await validateRegistry(registry(), {
    entryFile: ENTRY_FILE,
    isCurrentVersion: async () => true,
  });
  assert.equal(passing.ok, true);

  const failing = await validateRegistry(registry(), {
    entryFile: ENTRY_FILE,
    isCurrentVersion: async () => false, // 예: GitLab의 package.json이 다른 버전을 가리키는 경우
  });
  assert.equal(failing.ok, false);
  assert.ok(failing.checks.some((c) => c.id === "app1@1.4.0:gitlab" && !c.passed));
});

test("validateRegistry는 current 버전에 대해서만 GitLab과 대조하고, 나머지 등록된 버전은 대조하지 않는다", async () => {
  const withOldVersion: ResourceRegistry = {
    resources: {
      app1: {
        ...registry().resources.app1,
        versions: {
          ...registry().resources.app1.versions,
          "1.3.0": { url: "https://cdn.example.com/frontend/app1/1.3.0/remoteEntry.js" },
        },
      },
    },
  };

  const report = await validateRegistry(withOldVersion, {
    entryFile: ENTRY_FILE,
    isCurrentVersion: async (_url, version) => version === "1.4.0",
  });

  assert.equal(report.ok, true);
  assert.ok(!report.checks.some((c) => c.id === "app1@1.3.0:gitlab"));
  assert.ok(report.checks.some((c) => c.id === "app1@1.4.0:gitlab" && c.passed));
});
