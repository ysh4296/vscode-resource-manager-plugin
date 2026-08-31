import React from "react";
import type { ResourceViewModel } from "../messages";
import { ResourceItem } from "./ResourceItem";

export interface ResourceListProps {
  resources: ResourceViewModel[];
  onSetActive: (resourceName: string, version: string) => void;
  onSetGitlabProject: (resourceName: string, gitlabProject: string) => void;
}

export function ResourceList({ resources, onSetActive, onSetGitlabProject }: ResourceListProps): JSX.Element {
  if (resources.length === 0) {
    return <p className="empty">No resources found in the registry file.</p>;
  }

  return (
    <div className="resource-list">
      {resources.map((resource) => (
        <ResourceItem
          key={resource.name}
          resource={resource}
          onSetActive={onSetActive}
          onSetGitlabProject={onSetGitlabProject}
        />
      ))}
    </div>
  );
}
