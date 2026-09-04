import React from "react";
import type { ResourceViewModel } from "../messages";
import { AddResourceForm } from "./AddResourceForm";
import { ResourceItem } from "./ResourceItem";

export interface ResourceListProps {
  resources: ResourceViewModel[];
  onSetResourceLocation: (resourceName: string, microserviceUrl: string, cdnBaseUrl: string) => void;
  onAddResource: (resourceName: string, microserviceUrl: string, cdnBaseUrl: string) => void;
  onRemoveResource: (resourceName: string) => void;
}

export function ResourceList({
  resources,
  onSetResourceLocation,
  onAddResource,
  onRemoveResource,
}: ResourceListProps): JSX.Element {
  return (
    <div className="resource-list">
      {resources.length === 0 && <p className="empty">No resources found in the registry file.</p>}
      {resources.map((resource) => (
        <ResourceItem key={resource.name} resource={resource} onSetResourceLocation={onSetResourceLocation} onRemove={onRemoveResource} />
      ))}
      <AddResourceForm existingNames={resources.map((r) => r.name)} onAdd={onAddResource} />
    </div>
  );
}
