import React, { useEffect, useState } from "react";
import type { ResourceViewModel } from "../messages";
import { VersionList } from "./VersionList";

export interface ResourceItemProps {
  resource: ResourceViewModel;
  onSetResourceLocation: (resourceName: string, microserviceUrl: string, cdnBaseUrl: string) => void;
  onRemove: (resourceName: string) => void;
}

export function ResourceItem({ resource, onSetResourceLocation, onRemove }: ResourceItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(resource.microserviceUrl);
  const [draftCdn, setDraftCdn] = useState(resource.cdnBaseUrl);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  function removeClick(e: React.MouseEvent): void {
    e.stopPropagation();
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setConfirmingRemove(false);
    onRemove(resource.name);
  }

  // Second click must land within a few seconds, otherwise the "Remove?"
  // confirm state quietly reverts instead of arming a stale delete button.
  useEffect(() => {
    if (!confirmingRemove) {
      return;
    }
    const timer = setTimeout(() => setConfirmingRemove(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingRemove]);

  function startEditing(e: React.MouseEvent): void {
    e.stopPropagation();
    setDraftUrl(resource.microserviceUrl);
    setDraftCdn(resource.cdnBaseUrl);
    setEditing(true);
  }

  function save(e: React.MouseEvent | React.FormEvent): void {
    e.stopPropagation();
    e.preventDefault();
    onSetResourceLocation(resource.name, draftUrl, draftCdn);
    setEditing(false);
  }

  function cancel(e: React.MouseEvent): void {
    e.stopPropagation();
    setEditing(false);
  }

  return (
    <div className="resource-item">
      <div className="resource-header" onClick={() => setExpanded((e) => !e)}>
        <span className="chevron">{expanded ? "▾" : "▸"}</span>
        <span className="resource-name">{resource.name}</span>

        {editing ? (
          <form className="location-edit" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <label>
              Microservice URL
              <input
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://gitlab.example.com/group/subgroup/repo"
                autoFocus
              />
            </label>
            <label>
              CDN Base URL
              <input value={draftCdn} onChange={(e) => setDraftCdn(e.target.value)} placeholder="https://cdn.example.com" />
            </label>
            <div className="location-edit-actions">
              <button type="submit">Save</button>
              <button type="button" onClick={cancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <span className="resource-location" onClick={startEditing} title="Click to edit Microservice URL + CDN base URL">
            {resource.microserviceUrl || "(no microservice URL)"} · {resource.cdnBaseUrl || "(no CDN)"}
          </span>
        )}

        <span className="resource-current">Current Version: {resource.current}</span>
        <button
          className={confirmingRemove ? "remove-resource confirming" : "remove-resource"}
          onClick={removeClick}
          title={`Remove "${resource.name}" from the registry`}
        >
          {confirmingRemove ? "Confirm Remove?" : "Remove"}
        </button>
      </div>

      {expanded && (
        <div className="resource-body">
          <VersionList current={resource.current} versions={resource.versions} />
        </div>
      )}
    </div>
  );
}
