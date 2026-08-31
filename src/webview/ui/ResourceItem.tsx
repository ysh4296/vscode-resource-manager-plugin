import React, { useState } from "react";
import type { ResourceViewModel } from "../messages";
import { VersionList } from "./VersionList";

export interface ResourceItemProps {
  resource: ResourceViewModel;
  onSetActive: (resourceName: string, version: string) => void;
  onOpenRegister: (resourceName: string) => void;
}

export function ResourceItem({ resource, onSetActive, onOpenRegister }: ResourceItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="resource-item">
      <div className="resource-header" onClick={() => setExpanded((e) => !e)}>
        <span className="chevron">{expanded ? "▾" : "▸"}</span>
        <span className="resource-name">{resource.name}</span>
        <span className="resource-current">Current Version: {resource.current}</span>
      </div>

      {expanded && (
        <div className="resource-body">
          <VersionList
            current={resource.current}
            versions={resource.versions}
            onSetActive={(version) => onSetActive(resource.name, version)}
          />
          <button className="register-button" onClick={() => onOpenRegister(resource.name)}>
            + Register Version
          </button>
        </div>
      )}
    </div>
  );
}
