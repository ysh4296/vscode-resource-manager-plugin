import * as fs from "fs/promises";
import { ResourceRegistry } from "./types";

export class RegistryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryParseError";
  }
}

export function parseRegistry(raw: string): ResourceRegistry {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new RegistryParseError(`Invalid JSON: ${(err as Error).message}`);
  }

  if (typeof data !== "object" || data === null || !("resources" in data)) {
    throw new RegistryParseError('Registry JSON must have a top-level "resources" object');
  }

  return data as ResourceRegistry;
}

export async function readRegistryFile(filePath: string): Promise<{ registry: ResourceRegistry; raw: string }> {
  const raw = await fs.readFile(filePath, "utf8");
  return { registry: parseRegistry(raw), raw };
}

export function serializeRegistry(registry: ResourceRegistry): string {
  return JSON.stringify(registry, null, 2) + "\n";
}

export async function writeRegistryFile(filePath: string, registry: ResourceRegistry): Promise<void> {
  await fs.writeFile(filePath, serializeRegistry(registry), "utf8");
}
