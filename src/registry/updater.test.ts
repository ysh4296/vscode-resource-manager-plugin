import assert from "node:assert/strict";
import { test } from "node:test";
import { ResourceRegistry } from "./types";
import {
  RegistryUpdateError,
  addResource,
  registerVersion,
  removeResource,
  setActiveVersion,
  setCdnBaseUrl,
  setMicroserviceUrl,
  setResourceLocation,
} from "./updater";

function registry(): ResourceRegistry {
  return {
    resources: {
      app1: {
        microserviceUrl: "https://gitlab.example.com/frontend/app1",
        cdnBaseUrl: "https://cdn.example.com",
        current: "1.4.0",
        versions: {
          "1.4.0": { url: "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js" },
        },
      },
    },
  };
}

test("registerVersion은 current나 다른 버전은 건드리지 않고 새 버전만 추가한다", () => {
  const before = registry();
  const after = registerVersion(before, "app1", "1.5.0", "https://cdn.example.com/frontend/app1/1.5.0/remoteEntry.js");

  assert.equal(after.resources.app1.current, "1.4.0");
  assert.deepEqual(Object.keys(after.resources.app1.versions).sort(), ["1.4.0", "1.5.0"]);
  assert.notEqual(after, before); // 입력을 변경하지 않고 항상 새 객체를 반환한다
  assert.deepEqual(before.resources.app1.versions, {
    "1.4.0": { url: "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js" },
  });
});

test("registerVersion은 이미 등록된 버전이면 거부한다", () => {
  assert.throws(
    () => registerVersion(registry(), "app1", "1.4.0", "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js"),
    RegistryUpdateError
  );
});

test("registerVersion은 존재하지 않는 리소스면 거부한다", () => {
  assert.throws(() => registerVersion(registry(), "does-not-exist", "1.0.0", "http://x"), RegistryUpdateError);
});

test("setActiveVersion은 이미 등록된 버전에 대해서만 current를 바꾼다", () => {
  const before = registerVersion(registry(), "app1", "1.5.0", "https://cdn.example.com/frontend/app1/1.5.0/remoteEntry.js");
  const after = setActiveVersion(before, "app1", "1.5.0");
  assert.equal(after.resources.app1.current, "1.5.0");

  assert.throws(() => setActiveVersion(registry(), "app1", "9.9.9"), RegistryUpdateError);
});

test("setMicroserviceUrl은 URL이 실제로 바뀔 때 versions/current를 초기화하지만 cdnBaseUrl은 유지한다", () => {
  const after = setMicroserviceUrl(registry(), "app1", "https://gitlab.example.com/frontend/app1-renamed");

  assert.equal(after.resources.app1.microserviceUrl, "https://gitlab.example.com/frontend/app1-renamed");
  assert.equal(after.resources.app1.cdnBaseUrl, "https://cdn.example.com");
  assert.equal(after.resources.app1.current, "");
  assert.deepEqual(after.resources.app1.versions, {});
});

test("setMicroserviceUrl은 URL이 그대로면 아무것도 바꾸지 않는다(같은 객체 반환)", () => {
  const before = registry();
  const after = setMicroserviceUrl(before, "app1", "https://gitlab.example.com/frontend/app1");
  assert.equal(after, before);
});

test("setCdnBaseUrl은 값이 바뀔 때만 갱신하고, versions/current는 건드리지 않는다", () => {
  const after = setCdnBaseUrl(registry(), "app1", "https://new-cdn.example.com");
  assert.equal(after.resources.app1.cdnBaseUrl, "https://new-cdn.example.com");
  assert.equal(after.resources.app1.current, "1.4.0");
  assert.deepEqual(after.resources.app1.versions, registry().resources.app1.versions);

  const before = registry();
  const unchanged = setCdnBaseUrl(before, "app1", "https://cdn.example.com");
  assert.equal(unchanged, before);
});

test("setResourceLocation은 microserviceUrl/cdnBaseUrl을 한번에 저장하며, URL이 바뀌면 versions를 초기화한다", () => {
  const changedUrl = setResourceLocation(
    registry(),
    "app1",
    "https://gitlab.example.com/frontend/app1-renamed",
    "https://new-cdn.example.com"
  );
  assert.equal(changedUrl.resources.app1.microserviceUrl, "https://gitlab.example.com/frontend/app1-renamed");
  assert.equal(changedUrl.resources.app1.cdnBaseUrl, "https://new-cdn.example.com");
  assert.equal(changedUrl.resources.app1.current, "");
  assert.deepEqual(changedUrl.resources.app1.versions, {});
});

test("setResourceLocation은 microserviceUrl이 그대로고 cdnBaseUrl만 바뀌면 versions를 유지한다", () => {
  const cdnOnly = setResourceLocation(
    registry(),
    "app1",
    "https://gitlab.example.com/frontend/app1",
    "https://new-cdn.example.com"
  );
  assert.equal(cdnOnly.resources.app1.microserviceUrl, "https://gitlab.example.com/frontend/app1");
  assert.equal(cdnOnly.resources.app1.cdnBaseUrl, "https://new-cdn.example.com");
  assert.equal(cdnOnly.resources.app1.current, "1.4.0");
  assert.deepEqual(cdnOnly.resources.app1.versions, registry().resources.app1.versions);
});

test("addResource는 버전 하나로 새 항목을 만들고, 이름이 중복되면 거부한다", () => {
  const before = registry();
  const after = addResource(
    before,
    "app2",
    "https://gitlab.example.com/frontend/app2",
    "https://cdn.example.com",
    "2.0.0",
    "https://cdn.example.com/frontend/app2/2.0.0/remoteEntry.js"
  );

  assert.equal(after.resources.app2.microserviceUrl, "https://gitlab.example.com/frontend/app2");
  assert.equal(after.resources.app2.cdnBaseUrl, "https://cdn.example.com");
  assert.equal(after.resources.app2.current, "2.0.0");
  assert.deepEqual(Object.keys(after.resources.app2.versions), ["2.0.0"]);

  assert.throws(
    () =>
      addResource(after, "app2", "https://gitlab.example.com/frontend/app2-other", "https://cdn.example.com", "1.0.0", "http://x"),
    RegistryUpdateError
  );
});

test("removeResource는 해당 리소스만 제거하고 나머지는 그대로 둔다", () => {
  const before = addResource(
    registry(),
    "app2",
    "https://gitlab.example.com/frontend/app2",
    "https://cdn.example.com",
    "2.0.0",
    "https://cdn.example.com/frontend/app2/2.0.0/remoteEntry.js"
  );

  const after = removeResource(before, "app2");
  assert.deepEqual(Object.keys(after.resources), ["app1"]);
  assert.deepEqual(after.resources.app1, before.resources.app1);
});

test("removeResource는 존재하지 않는 리소스면 거부한다", () => {
  assert.throws(() => removeResource(registry(), "does-not-exist"), RegistryUpdateError);
});
