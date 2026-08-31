import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeProjectId } from "./client";

test("프로젝트 경로를 URL 세그먼트 하나로 안전하게 percent-encoding 한다", () => {
  assert.equal(encodeProjectId("frontend/app1"), "frontend%2Fapp1");
});
