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
 * Changing which GitLab project a resource points at invalidates its
 * existing `versions`/`current` — those versions belonged to the *old*
 * project and have no relationship to the new one, so they're wiped
 * instead of being left to mix with whatever the new project's own
 * versions turn out to be. Re-saving the same project path is a no-op on
 * versions (nothing actually changed).
 */
export function setGitlabProject(registry: ResourceRegistry, resourceName: string, gitlabProject: string): ResourceRegistry {
  const resource = registry.resources[resourceName];
  if (!resource) {
    throw new RegistryUpdateError(`Unknown resource "${resourceName}"`);
  }

  if (resource.gitlabProject === gitlabProject) {
    return registry;
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { gitlabProject, current: "", versions: {} },
    },
  };
}

export function addResource(
  registry: ResourceRegistry,
  resourceName: string,
  gitlabProject: string,
  current: string,
  url: string
): ResourceRegistry {
  if (Object.prototype.hasOwnProperty.call(registry.resources, resourceName)) {
    throw new RegistryUpdateError(`Resource "${resourceName}" already exists`);
  }

  return {
    resources: {
      ...registry.resources,
      [resourceName]: { gitlabProject, current, versions: { [current]: { url } } },
    },
  };
}
