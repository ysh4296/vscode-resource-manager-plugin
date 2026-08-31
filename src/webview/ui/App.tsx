import React, { useEffect, useReducer, useState } from "react";
import type { AppState, CandidateCheckResult, ExtensionResponse, PackageVersionOption, RemoteStatus } from "../messages";
import type { ValidationReport } from "../../registry/validator";
import { sendRequest, onResponse } from "./vscodeApi";
import { SettingsForm } from "./SettingsForm";
import { ResourceList } from "./ResourceList";
import { RegisterVersionDialog } from "./RegisterVersionDialog";
import { DeployPanel, DiffState, PushOutcome } from "./DeployPanel";

type Tab = "resources" | "settings" | "deploy";

interface UIData {
  appState: AppState | null;
  packageVersions: Record<string, PackageVersionOption[]>;
  candidateCheck: CandidateCheckResult | null;
  validationReport: ValidationReport | null;
  diff: DiffState | null;
  remoteStatus: RemoteStatus | null;
  pushResult: PushOutcome | null;
}

const initialData: UIData = {
  appState: null,
  packageVersions: {},
  candidateCheck: null,
  validationReport: null,
  diff: null,
  remoteStatus: null,
  pushResult: null,
};

function reducer(state: UIData, response: ExtensionResponse): UIData {
  switch (response.type) {
    case "state":
      return { ...state, appState: response.state };
    case "packageVersions":
      return { ...state, packageVersions: { ...state.packageVersions, [response.resourceName]: response.versions } };
    case "candidateCheckResult":
      return { ...state, candidateCheck: response.result };
    case "registerVersionResult":
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
    default:
      return state;
  }
}

function toastForResponse(response: ExtensionResponse): string | null {
  switch (response.type) {
    case "registerVersionResult":
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
  const [registerDialogResource, setRegisterDialogResource] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onResponse((response) => {
      dispatch(response);
      const toastMessage = toastForResponse(response);
      if (toastMessage) {
        setToast(toastMessage);
      }
      if (response.type === "registerVersionResult" && response.success) {
        setRegisterDialogResource(null);
      }
    });
    sendRequest({ type: "getState" });
    return unsubscribe;
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
        {data.appState && <p className="repository-label">Repository: {data.appState.config.projectPath || "(not configured)"}</p>}
        <nav className="tabs">
          <button className={tab === "resources" ? "active" : ""} onClick={() => setTab("resources")} disabled={!configComplete}>
            Resources
          </button>
          <button className={tab === "deploy" ? "active" : ""} onClick={() => setTab("deploy")} disabled={!configComplete}>
            Validate & Push
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
              onOpenRegister={setRegisterDialogResource}
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
      </main>

      {registerDialogResource && (
        <RegisterVersionDialog
          resourceName={registerDialogResource}
          versions={data.packageVersions[registerDialogResource] ?? []}
          candidate={data.candidateCheck}
          onLoadVersions={() => sendRequest({ type: "getPackageVersions", resourceName: registerDialogResource })}
          onSelectVersion={(version) => sendRequest({ type: "checkCandidate", resourceName: registerDialogResource, version })}
          onRegister={(version) => sendRequest({ type: "registerVersion", resourceName: registerDialogResource, version })}
          onClose={() => setRegisterDialogResource(null)}
        />
      )}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
