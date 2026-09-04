import assert from "node:assert/strict";
import { test } from "node:test";
import { RegistryParseError, parseRegistry, serializeRegistry } from "./parser";
import { ResourceRegistry } from "./types";

test("parseRegistry는 정상적인 registry JSON을 파싱한다", () => {
  const registry = parseRegistry('{"resources":{"app1":{"microserviceUrl":"https://gitlab.example.com/g/app1","current":"1.0.0","versions":{}}}}');
  assert.equal(registry.resources.app1.current, "1.0.0");
});

test("parseRegistry는 잘못된 JSON을 RegistryParseError로 거부한다", () => {
  assert.throws(() => parseRegistry("{ not json"), RegistryParseError);
});

test('parseRegistry는 최상위 "resources" 객체가 없는 JSON을 거부한다', () => {
  assert.throws(() => parseRegistry('{"foo":"bar"}'), RegistryParseError);
  assert.throws(() => parseRegistry("null"), RegistryParseError);
  assert.throws(() => parseRegistry("42"), RegistryParseError);
});

test("serializeRegistry는 parseRegistry로 다시 복원 가능하고, 끝에 개행이 붙는다", () => {
  const registry: ResourceRegistry = {
    resources: { app1: { microserviceUrl: "https://gitlab.example.com/g/app1", cdnBaseUrl: "http://x", current: "1.0.0", versions: { "1.0.0": { url: "http://x" } } } },
  };
  const serialized = serializeRegistry(registry);

  assert.ok(serialized.endsWith("\n"));
  assert.deepEqual(parseRegistry(serialized), registry);
});
