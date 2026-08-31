import React from "react";
import type { ResourceChangeSummary } from "../../git/diff";
import type { ValidationReport } from "../../registry/validator";
import type { RemoteStatus } from "../messages";
import { GitDiff } from "./GitDiff";
import { ValidationResult } from "./ValidationResult";

export interface DiffState {
  diff: string;
  summary: ResourceChangeSummary[];
  defaultCommitMessage: string;
}

export interface PushOutcome {
  success: boolean;
  message?: string;
  blocked?: boolean;
}

export interface DeployPanelProps {
  validationReport: ValidationReport | null;
  diff: DiffState | null;
  remoteStatus: RemoteStatus | null;
  pushResult: PushOutcome | null;
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  onValidate: () => void;
  onLoadDiff: () => void;
  onCommit: () => void;
  onCheckRemote: () => void;
  onPush: () => void;
}

/**
 * Composes the Edit -> Validate -> Diff -> Commit -> Pre-push check -> Push
 * workflow. Push stays disabled once a remote-divergence check reports the
 * branch has moved; the actual pre-push validation gate lives server-side
 * in messageHandler, this is just reflecting that state in the UI.
 *
 * Deploy-history snapshots aren't recorded from here — they're taken
 * automatically (see registryService.autoRecordDeploySnapshot) whenever the
 * managed repo's own package.json version changes, and picked up by the
 * diff below like any other file change. See the Deploy History tab to
 * browse what's been recorded.
 */
export function DeployPanel(props: DeployPanelProps): JSX.Element {
  const {
    validationReport,
    diff,
    remoteStatus,
    pushResult,
    commitMessage,
    onCommitMessageChange,
    onValidate,
    onLoadDiff,
    onCommit,
    onCheckRemote,
    onPush,
  } = props;

  return (
    <div className="deploy-panel">
      <ValidationResult report={validationReport} onValidate={onValidate} />
      <GitDiff diff={diff?.diff ?? null} summary={diff?.summary ?? []} onLoadDiff={onLoadDiff} />

      <div className="panel commit-panel">
        <h3>Commit</h3>
        <input
          className="commit-message-input"
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
          placeholder={diff?.defaultCommitMessage ?? "chore: update MFE resource versions"}
        />
        <button onClick={onCommit}>Commit</button>
      </div>

      <div className="panel remote-panel">
        <h3>Remote Status</h3>
        <button onClick={onCheckRemote}>Fetch &amp; Check Remote</button>
        {remoteStatus && <p className={remoteStatus.diverged ? "status-bad" : "status-ok"}>{remoteStatus.message}</p>}
      </div>

      <div className="panel push-panel">
        <h3>Push</h3>
        <button onClick={onPush} disabled={Boolean(remoteStatus?.diverged)}>
          Push
        </button>
        {pushResult && (
          <p className={pushResult.success ? "status-ok" : "status-bad"}>
            {pushResult.blocked ? "Push blocked" : pushResult.success ? "Pushed successfully." : "Push failed."}
            {pushResult.message ? ` — ${pushResult.message}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
