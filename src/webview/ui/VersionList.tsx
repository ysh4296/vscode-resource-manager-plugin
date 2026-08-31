import React from "react";
import type { ResourceVersionStatus } from "../messages";

export interface VersionListProps {
  current: string;
  versions: ResourceVersionStatus[];
  onSetActive: (version: string) => void;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <span className={`badge ${ok ? "badge-ok" : "badge-bad"}`}>
      {ok ? "✅" : "❌"} {label}
    </span>
  );
}

export function VersionList({ current, versions, onSetActive }: VersionListProps): JSX.Element {
  if (versions.length === 0) {
    return <p className="hint">No versions registered yet.</p>;
  }

  return (
    <div className="version-list">
      {versions.map((v) => {
        const isActive = v.version === current;
        const gitlabOk = v.gitlab === "yes";
        const s3Ok = v.s3 === "available";
        const canActivate = gitlabOk && s3Ok && !isActive;

        return (
          <div key={v.version} className={isActive ? "version-row active-row" : "version-row"}>
            <span className="version-cell">{v.version}</span>
            <div className="version-badges">
              <StatusBadge ok={gitlabOk} label="GitLab" />
              <StatusBadge ok={s3Ok} label="S3" />
            </div>
            {isActive ? (
              <span className="active-label">Active</span>
            ) : (
              <button
                disabled={!canActivate}
                title={canActivate ? undefined : "GitLab package and S3 resource must both be available"}
                onClick={() => onSetActive(v.version)}
              >
                Set Active
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
