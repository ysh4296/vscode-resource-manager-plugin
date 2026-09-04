import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResourceUrl } from "./buildResourceUrl";

test("baseUrl 뒤에 projectPath의 각 경로 세그먼트, version, entryFile 순서로 URL을 조합한다", () => {
  const url = buildResourceUrl({
    baseUrl: "https://cdn.example.com",
    projectPath: "frontend/app1",
    version: "1.5.0",
    entryFile: "remoteEntry.js",
  });
  assert.equal(url, "https://cdn.example.com/frontend/app1/1.5.0/remoteEntry.js");
});

test("baseUrl 끝의 슬래시와 각 세그먼트의 불필요한 슬래시를 제거한다", () => {
  const url = buildResourceUrl({
    baseUrl: "https://cdn.example.com/",
    projectPath: "/frontend/app1/",
    version: "/1.5.0/",
    entryFile: "/remoteEntry.js/",
  });
  assert.equal(url, "https://cdn.example.com/frontend/app1/1.5.0/remoteEntry.js");
});

test("빈 세그먼트가 있으면 어떤 필드인지 이름을 밝히며 에러를 던진다", () => {
  assert.throws(
    () => buildResourceUrl({ baseUrl: "https://cdn.example.com", projectPath: "", version: "1.0.0", entryFile: "remoteEntry.js" }),
    /projectPath/
  );
  assert.throws(
    () =>
      buildResourceUrl({ baseUrl: "https://cdn.example.com", projectPath: "frontend/app1", version: "  ", entryFile: "remoteEntry.js" }),
    /version/
  );
});
