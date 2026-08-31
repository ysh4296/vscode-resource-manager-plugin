import React from "react";
import type { DeploySnapshot } from "../messages";

export interface DeployHistoryProps {
  snapshots: DeploySnapshot[] | null;
  onRefresh: () => void;
}

export function DeployHistory({ snapshots, onRefresh }: DeployHistoryProps): JSX.Element {
  return (
    <div className="panel deploy-history">
      <div className="panel-header">
        <h3>Deployment History</h3>
        <button onClick={onRefresh}>Refresh</button>
      </div>
      <p className="hint">
        Recorded from the "Validate & Push" tab — each snapshot captures which version of every resource was active
        under a given host version, at the moment it was recorded.
      </p>

      {snapshots === null && <p className="hint">Click Refresh to load deployment history.</p>}
      {snapshots !== null && snapshots.length === 0 && <p className="hint">No snapshots recorded yet.</p>}

      {snapshots !== null &&
        snapshots.map((snapshot) => (
          <div key={snapshot.hostVersion} className="deploy-snapshot">
            <div className="deploy-snapshot-header">
              <strong>host@{snapshot.hostVersion}</strong>
              <span className="hint">{new Date(snapshot.recordedAt).toLocaleString()}</span>
            </div>
            <table className="deploy-snapshot-table">
              <tbody>
                {Object.entries(snapshot.resources).map(([resourceName, version]) => (
                  <tr key={resourceName}>
                    <td>{resourceName}</td>
                    <td className="version-cell">{version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
