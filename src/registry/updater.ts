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

/**
 * Changing which microservice URL (GitLab instance + project) a resource
 * points at invalidates its existing `versions`/`current` — those
 * versions belonged to the *old* project and have no relationship to the
 * new one, so they're wiped instead of being left to mix with whatever
 * the new project's own versions turn out to be. Re-saving the same URL
 * is a no-op on versions (nothing actually changed).
 */
export function setMicroserviceUrl(registry: ResourceRegistry, resourceName: string, microserviceUrl: string): ResourceRegistry {
  const resource = registry.resources[resourceName];
  if (!resource) {
    throw new RegistryUpdateError(`Unknown resource "${resourceName}"`);
  }

  if (resource.microserviceUrl === microserviceUrl) {
    return registry;
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { ...resource, microserviceUrl, current: "", versions: {} },
    },
  };
}

/**
 * Unlike setGitlabProject, changing the CDN base URL doesn't invalidate
 * existing versions — the versions themselves haven't changed, only where
 * their files are served from. Existing entries' stored `url` values will
 * simply fail the "URL matches rule" validation check until they're
 * re-registered against the new base.
 */
export function setCdnBaseUrl(registry: ResourceRegistry, resourceName: string, cdnBaseUrl: string): ResourceRegistry {
  const resource = registry.resources[resourceName];
  if (!resource) {
    throw new RegistryUpdateError(`Unknown resource "${resourceName}"`);
  }

  if (resource.cdnBaseUrl === cdnBaseUrl) {
    return registry;
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { ...resource, cdnBaseUrl },
    },
  };
}

/**
 * Sets microserviceUrl and cdnBaseUrl together as one paired update — the
 * two values are entered and verified as a pair from the UI. Composes the
 * two single-field updaters so the reset-on-url-change rule still applies
 * (see setMicroserviceUrl) while the CDN URL is applied on top.
 */
export function setResourceLocation(
  registry: ResourceRegistry,
  resourceName: string,
  microserviceUrl: string,
  cdnBaseUrl: string
): ResourceRegistry {
  const afterProject = setMicroserviceUrl(registry, resourceName, microserviceUrl);
  return setCdnBaseUrl(afterProject, resourceName, cdnBaseUrl);
}

export function addResource(
  registry: ResourceRegistry,
  resourceName: string,
  microserviceUrl: string,
  cdnBaseUrl: string,
  current: string,
  url: string
): ResourceRegistry {
  if (Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
    throw new RegistryUpdateError(`Resource "${resourceName}" already exists`);
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { microserviceUrl, cdnBaseUrl, current, versions: { [current]: { url } } },
    },
  };
}

export function removeResource(registry: ResourceRegistry, resourceName: string): ResourceRegistry {
  if (!Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
    throw new RegistryUpdateError(`Unknown resource "${resourceName}"`);
  }

  return {
    resources: Object.fromEntries(Object.entries(registry.resources).filter(([name]) => name !== resourceName)),
  };
}
