import React from "react";
import type { ResourceChangeSummary } from "../../git/diff";

export interface GitDiffProps {
  diff: string | null;
  summary: ResourceChangeSummary[];
  onLoadDiff: () => void;
}

export function GitDiff({ diff, summary, onLoadDiff }: GitDiffProps): JSX.Element {
  return (
    <div className="panel git-diff">
      <div className="panel-header">
        <h3>Git Diff</h3>
        <button onClick={onLoadDiff}>Refresh Diff</button>
      </div>

      {summary.length > 0 && (
        <div className="diff-summary">
          {summary.map((s) => (
            <div key={s.resourceName} className="diff-summary-block">
              <strong>{s.resourceName}</strong>
              {s.currentChanged && (
                <>
                  <div className="diff-line diff-removed">- current: {s.currentChanged.from}</div>
                  <div className="diff-line diff-added">+ current: {s.currentChanged.to}</div>
                </>
              )}
              {s.addedVersions.map((v) => (
                <div key={v} className="diff-line diff-added">
                  + {v}
                </div>
              ))}
              {s.removedVersions.map((v) => (
                <div key={v} className="diff-line diff-removed">
                  - {v}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <pre className="diff-raw">{diff || "No changes detected yet. Click Refresh Diff."}</pre>
    </div>
  );
}
