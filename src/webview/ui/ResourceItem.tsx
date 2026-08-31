import React, { useState } from "react";
import type { ResourceViewModel } from "../messages";
import { VersionList } from "./VersionList";

export interface ResourceItemProps {
  resource: ResourceViewModel;
  onSetActive: (resourceName: string, version: string) => void;
  onSetGitlabProject: (resourceName: string, gitlabProject: string) => void;
}

export function ResourceItem({ resource, onSetActive, onSetGitlabProject }: ResourceItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const [editingProject, setEditingProject] = useState(false);
  const [draftProject, setDraftProject] = useState(resource.gitlabProject);

  function startEditing(e: React.MouseEvent): void {
    e.stopPropagation();
    setDraftProject(resource.gitlabProject);
    setEditingProject(true);
  }

  function save(e: React.MouseEvent | React.FormEvent): void {
    e.stopPropagation();
    e.preventDefault();
    onSetGitlabProject(resource.name, draftProject);
    setEditingProject(false);
  }

  function cancel(e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingProject(false);
  }

  return (
    <div className="resource-item">
      <div className="resource-header" onClick={() => setExpanded((e) => !e)}>
        <span className="chevron">{expanded ? "▾" : "▸"}</span>
        <span className="resource-name">{resource.name}</span>

        {editingProject ? (
          <form className="resource-project-edit" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <input
              value={draftProject}
              onChange={(e) => setDraftProject(e.target.value)}
              placeholder="group/subgroup/repo"
              autoFocus
            />
            <button type="submit">Save</button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          </form>
        ) : (
          <span className="resource-project" onClick={startEditing} title="Click to edit GitLab project">
            {resource.gitlabProject || "(click to set GitLab project)"}
          </span>
        )}

        <span className="resource-current">Current Version: {resource.current}</span>
      </div>

      {expanded && (
        <div className="resource-body">
          <VersionList
            current={resource.current}
            versions={resource.versions}
            onSetActive={(version) => onSetActive(resource.name, version)}
          />
        </div>
      )}
    </div>
  );
}
