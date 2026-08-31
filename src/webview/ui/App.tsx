import React, { useEffect, useReducer, useState } from "react";
import type { AppState, DeploySnapshot, ExtensionResponse, RemoteStatus } from "../messages";
import type { ValidationReport } from "../../registry/validator";
import { sendRequest, onResponse } from "./vscodeApi";
import { SettingsForm } from "./SettingsForm";
import { ResourceList } from "./ResourceList";
import { DeployPanel, DiffState, PushOutcome } from "./DeployPanel";
import { DeployHistory } from "./DeployHistory";

type Tab = "resources" | "settings" | "deploy" | "history";

/** How often the webview re-pulls state on its own, so newly published GitLab
 * versions get auto-registered without the user having to do anything. */
const AUTO_REFRESH_INTERVAL_MS = 30000;

interface UIData {
  appState: AppState | null;
  validationReport: ValidationReport | null;
  diff: DiffState | null;
  remoteStatus: RemoteStatus | null;
  pushResult: PushOutcome | null;
  deployHistory: DeploySnapshot[] | null;
}

const initialData: UIData = {
  appState: null,
  validationReport: null,
  diff: null,
  remoteStatus: null,
  pushResult: null,
  deployHistory: null,
};

function reducer(state: UIData, response: ExtensionResponse): UIData {
  switch (response.type) {
    case "state":
      return { ...state, appState: response.state };
    case "setActiveVersionResult":
    case "addResourceResult":
      return { ...state, appState: response.state ?? state.appState };
    case "validationResult":
      return { ...state, validationReport: response.report };
    case "diffResult":
      return { ...state, diff: { diff: response.diff, summary: response.summary, defaultCommitMessage: response.defaultCommitMessage } };
    case "remoteStatusResult":
      return { ...state, remoteStatus: response.status };
    case "pushResult":
      return { ...state, pushResult: response };
    case "deployHistoryResult":
      return { ...state, deployHistory: response.snapshots };
    default:
      return state;
  }
}

function toastForResponse(response: ExtensionResponse): string | null {
  switch (response.type) {
    case "state": {
      const parts: string[] = [];
      if (response.state.autoRegistered && response.state.autoRegistered.length > 0) {
        const names = response.state.autoRegistered.map((v) => `${v.resourceName}@${v.version}`).join(", ");
        parts.push(`자동 등록됨: ${names}`);
      }
      if (response.state.autoSnapshotRecorded) {
        parts.push(`배포 스냅샷 기록됨: host@${response.state.autoSnapshotRecorded}`);
      }
      return parts.length > 0 ? parts.join(" / ") : null;
    }
    case "setActiveVersionResult":
    case "addResourceResult":
      return response.success ? "Registry updated." : (response.message ?? "Operation failed.");
    case "commitResult":
      return response.success ? "Committed." : (response.message ?? "Commit failed.");
    case "error":
      return response.message;
    default:
      return null;
  }
}

export function App(): JSX.Element {
  const [data, dispatch] = useReducer(reducer, initialData);
  const [tab, setTab] = useState<Tab>("resources");
  const [commitMessage, setCommitMessage] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onResponse((response) => {
      dispatch(response);
      const toastMessage = toastForResponse(response);
      if (toastMessage) {
        setToast(toastMessage);
      }
      if (response.type === "state" && response.state.autoSnapshotRecorded) {
        sendRequest({ type: "getDiff" });
      }
    });
    sendRequest({ type: "getState" });
    return unsubscribe;
  }, []);

  // Always-latest-data: re-pull state periodically. getState() itself checks
  // GitLab for versions not yet in the registry and auto-registers any whose
  // S3 resource is confirmed available, so this keeps the list current
  // without a manual "Register Version" step.
  useEffect(() => {
    const interval = setInterval(() => sendRequest({ type: "getState" }), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (data.appState && !data.appState.configComplete) {
      setTab("settings");
    }
  }, [data.appState?.configComplete]);

  useEffect(() => {
    if (data.diff?.defaultCommitMessage && !commitMessage) {
      setCommitMessage(data.diff.defaultCommitMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.diff?.defaultCommitMessage]);

  const configComplete = data.appState?.configComplete ?? false;

  return (
    <div className="app">
      <header className="app-header">
        <h1>MFE Resource Registry</h1>
        {data.appState && <p className="repository-label">GitLab: {data.appState.config.gitlabUrl || "(not configured)"}</p>}
        <nav className="tabs">
          <button className={tab === "resources" ? "active" : ""} onClick={() => setTab("resources")} disabled={!configComplete}>
            Resources
          </button>
          <button className={tab === "deploy" ? "active" : ""} onClick={() => setTab("deploy")} disabled={!configComplete}>
            Validate & Push
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")} disabled={!configComplete}>
            Deploy History
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            Settings
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === "settings" && (
          <SettingsForm
            config={data.appState?.config}
            onSave={(config) => sendRequest({ type: "saveConfig", config })}
            onSaveToken={(token) => sendRequest({ type: "saveToken", token })}
          />
        )}

        {tab === "resources" && configComplete && data.appState && (
          <>
            {data.appState.loadError && <p className="status-bad">{data.appState.loadError}</p>}
            <ResourceList
              resources={data.appState.resources}
              onSetActive={(resourceName, version) => sendRequest({ type: "setActiveVersion", resourceName, version })}
            />
          </>
        )}

        {tab === "deploy" && configComplete && (
          <DeployPanel
            validationReport={data.validationReport}
            diff={data.diff}
            remoteStatus={data.remoteStatus}
            pushResult={data.pushResult}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onValidate={() => sendRequest({ type: "validate" })}
            onLoadDiff={() => sendRequest({ type: "getDiff" })}
            onCommit={() => sendRequest({ type: "commit", message: commitMessage })}
            onCheckRemote={() => sendRequest({ type: "checkRemoteStatus" })}
            onPush={() => sendRequest({ type: "push" })}
          />
        )}

        {tab === "history" && configComplete && (
          <DeployHistory snapshots={data.deployHistory} onRefresh={() => sendRequest({ type: "getDeployHistory" })} />
        )}
      </main>

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
