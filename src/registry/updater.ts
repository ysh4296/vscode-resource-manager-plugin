import { ResourceRegistry } from "./types";

export class RegistryUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryUpdateError";
  }
}

/**
 * All updater functions are pure: they return a new registry rather than
 * mutating the input, and never perform I/O or network calls themselves.
 * Callers (services) are responsible for running GitLab/S3 checks *before*
 * calling these and persisting the result *after*.
 */
export function registerVersion(
  registry: ResourceRegistry,
  resourceName: string,
  version: string,
  url: string
): ResourceRegistry {
  const resource = registry.resources[resourceName];
  if (!resource) {
    throw new RegistryUpdateError(`Unknown resource "${resourceName}"`);
  }
  if (Object.prototype.hasOwnProperty.call(resource.versions, version)) {
    throw new RegistryUpdateError(`Version "${version}" is already registered for "${resourceName}"`);
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: {
        ...resource,
        versions: { ...resource.versions, [version]: { url } },
      },
    },
  };
}

export function setActiveVersion(registry: ResourceRegistry, resourceName: string, version: string): ResourceRegistry {
  const resource = registry.resources[resourceName];
  if (!resource) {
    throw new RegistryUpdateError(`Unknown resource "${resourceName}"`);
  }
  if (!Object.prototype.hasOwnProperty.call(resource.versions, version)) {
    throw new RegistryUpdateError(`Version "${version}" is not registered for "${resourceName}"`);
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { ...resource, current: version },
    },
  };
}

export function addResource(registry: ResourceRegistry, resourceName: string, current: string, url: string): ResourceRegistry {
  if (Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
    throw new RegistryUpdateError(`Resource "${resourceName}" already exists`);
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { current, versions: { [current]: { url } } },
    },
  };
}
