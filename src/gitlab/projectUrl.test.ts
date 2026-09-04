import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMicroserviceUrl } from "./projectUrl";

test("parseMicroserviceUrl은 origin과 project path를 분리한다", () => {
  const result = parseMicroserviceUrl("https://gitlab.example.com/frontend/app1");
  assert.equal(result.baseUrl, "https://gitlab.example.com");
  assert.equal(result.projectPath, "frontend/app1");
});

test("parseMicroserviceUrl은 하위그룹이 있는 경로도 그대로 유지한다", () => {
  const result = parseMicroserviceUrl("https://gitlab.example.com/group/subgroup/repo");
  assert.equal(result.projectPath, "group/subgroup/repo");
});

test("parseMicroserviceUrl은 git clone 주소처럼 끝에 붙은 .git을 제거한다", () => {
  const result = parseMicroserviceUrl("https://gitlab.com/harba-io/redis-sentinel.git");
  assert.equal(result.baseUrl, "https://gitlab.com");
  assert.equal(result.projectPath, "harba-io/redis-sentinel");
});

test("parseMicroserviceUrl은 끝에 슬래시가 있어도 프로젝트 경로를 정확히 뽑아낸다", () => {
  const result = parseMicroserviceUrl("https://gitlab.example.com/frontend/app1/");
  assert.equal(result.projectPath, "frontend/app1");
});

test("parseMicroserviceUrl은 프로젝트 경로가 없으면 에러를 던진다", () => {
  assert.throws(() => parseMicroserviceUrl("https://gitlab.example.com"), /missing a project path/);
});

test("parseMicroserviceUrl은 잘못된 URL이면 에러를 던진다", () => {
  assert.throws(() => parseMicroserviceUrl("not-a-url"), /not a valid URL/);
});
