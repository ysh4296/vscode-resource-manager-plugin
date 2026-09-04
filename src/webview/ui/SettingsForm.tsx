import React, { useEffect, useState } from "react";
import type { RepositoryConfigDTO } from "../messages";

export interface SettingsFormProps {
  config?: RepositoryConfigDTO;
  onSave: (config: Omit<RepositoryConfigDTO, "hasToken">) => void;
  onSaveToken: (token: string) => void;
}

export function SettingsForm({ config, onSave, onSaveToken }: SettingsFormProps): JSX.Element {
  const [repositoryUrl, setRepositoryUrl] = useState(config?.repositoryUrl ?? "");
  const [jsonPath, setJsonPath] = useState(config?.jsonPath ?? "resources.json");
  const [entryFile, setEntryFile] = useState(config?.entryFile ?? "remoteEntry.js");
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!config) {
      return;
    }
    setRepositoryUrl(config.repositoryUrl);
    setJsonPath(config.jsonPath);
    setEntryFile(config.entryFile);
  }, [config]);

  return (
    <div className="panel settings-form">
      <h2>Repository Settings</h2>

      <label>
        Repository URL
        <input
          value={repositoryUrl}
          onChange={(e) => setRepositoryUrl(e.target.value)}
          placeholder="git@gitlab.example.com:group/mfe-resource-registry.git"
        />
      </label>
      <p className="hint">
        Git clone URL of the repo holding the registry JSON. The extension clones/manages this on its own — you don't
        need to have it open as a VS Code workspace.
      </p>
      <label>
        JSON Path
        <input value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} placeholder="resources.json" />
      </label>
      <label>
        Entry File
        <input value={entryFile} onChange={(e) => setEntryFile(e.target.value)} placeholder="remoteEntry.js" />
      </label>
      <button onClick={() => onSave({ repositoryUrl, jsonPath, entryFile })}>Save Repository Settings</button>
      <p className="hint">
        There's no global GitLab instance setting — each resource has its own full Microservice URL (GitLab instance +
        project) and CDN base URL, set per-resource on the Resources tab. Different MFEs can live on entirely
        different GitLab instances; the token below is shared across all of them.
      </p>

      <hr />

      <h3>GitLab Token</h3>
      <p className="hint">
        {config?.hasToken ? "A token is currently stored in VS Code Secret Storage." : "No token stored yet."}
      </p>
      <label>
        Token
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="glpat-..." />
      </label>
      <button
        disabled={!token}
        onClick={() => {
          onSaveToken(token);
          setToken("");
        }}
      >
        Save Token
      </button>
    </div>
  );
}
