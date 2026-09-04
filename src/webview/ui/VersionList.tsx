import React from "react";
import type { ResourceVersionStatus } from "../messages";

export interface VersionListProps {
  current: string;
  versions: ResourceVersionStatus[];
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <span className={`badge ${ok ? "badge-ok" : "badge-bad"}`}>
      {ok ? "✅" : "❌"} {label}
    </span>
  );
}

export function VersionList({ current, versions }: VersionListProps): JSX.Element {
  if (versions.length === 0) {
    return <p className="hint">No versions registered yet.</p>;
  }

  return (
    <div className="version-list">
      {versions.map((v) => {
        const isActive = v.version === current;

        return (
          <div key={v.version} className={isActive ? "version-row active-row" : "version-row"}>
            <span className="version-cell">{v.version}</span>
            <div className="version-badges">
              <StatusBadge ok={v.gitlab === "yes"} label="GitLab" />
            </div>
            {isActive && <span className="active-label">Active</span>}
          </div>
        );
      })}
    </div>
  );
}
