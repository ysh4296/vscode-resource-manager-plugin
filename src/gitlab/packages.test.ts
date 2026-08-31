import assert from "node:assert/strict";
import { test } from "node:test";
import { sortPackageVersions } from "./packages";
import { PackageVersionInfo } from "./types";

function v(version: string, createdAt: string, isSemver = true): PackageVersionInfo {
  return { version, createdAt, isSemver };
}

test("sortPackageVersions는 유효한 SemVer를 최신순으로 정렬하며, 문자열 정렬로 빠지지 않는다", () => {
  const sorted = sortPackageVersions([v("1.9.0", "2024-01-01"), v("1.10.0", "2024-01-02"), v("1.2.0", "2024-01-03")]);
  // 단순 문자열 정렬이면 "1.10.0"이 "1.2.0"보다 "1.9.0"보다 앞에 오지만, SemVer 정렬은 그러면 안 된다.
  assert.deepEqual(
    sorted.map((s) => s.version),
    ["1.10.0", "1.9.0", "1.2.0"]
  );
});

test("sortPackageVersions는 SemVer가 아닌 버전을 전부 뒤로 보내고, 그 안에서는 생성일 최신순으로 정렬한다", () => {
  const sorted = sortPackageVersions([
    v("build-42", "2024-03-01", false),
    v("1.0.0", "2024-01-01", true),
    v("build-99", "2024-04-01", false),
  ]);
  assert.deepEqual(
    sorted.map((s) => s.version),
    ["1.0.0", "build-99", "build-42"]
  );
});
