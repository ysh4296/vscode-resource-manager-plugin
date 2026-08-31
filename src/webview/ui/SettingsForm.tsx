import React, { useEffect, useState } from "react";
import type { RepositoryConfigDTO } from "../messages";

export interface SettingsFormProps {
  config?: RepositoryConfigDTO;
  onSave: (config: Omit<RepositoryConfigDTO, "hasToken">) => void;
  onSaveToken: (token: string) => void;
}

export function SettingsForm({ config, onSave, onSaveToken }: SettingsFormProps): JSX.Element {
  const [gitlabUrl, setGitlabUrl] = useState(config?.gitlabUrl ?? "");
  const [projectPath, setProjectPath] = useState(config?.projectPath ?? "");
  const [jsonPath, setJsonPath] = useState(config?.jsonPath ?? "resources.json");
  const [s3BaseUrl, setS3BaseUrl] = useState(config?.s3BaseUrl ?? "");
  const [entryFile, setEntryFile] = useState(config?.entryFile ?? "remoteEntry.js");
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!config) {
      return;
    }
    setGitlabUrl(config.gitlabUrl);
    setProjectPath(config.projectPath);
    setJsonPath(config.jsonPath);
    setS3BaseUrl(config.s3BaseUrl);
    setEntryFile(config.entryFile);
  }, [config]);

  return (
    <div className="panel settings-form">
      <h2>Repository Settings</h2>

      <label>
        GitLab URL
        <input value={gitlabUrl} onChange={(e) => setGitlabUrl(e.target.value)} placeholder="https://gitlab.example.com" />
      </label>
      <label>
        Project (ID or path)
        <input value={projectPath} onChange={(e) => setProjectPath(e.target.value)} placeholder="frontend/mfe-resource-registry" />
      </label>
      <label>
        JSON Path
        <input value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} placeholder="resources.json" />
      </label>
      <label>
        S3 Base URL
        <input value={s3BaseUrl} onChange={(e) => setS3BaseUrl(e.target.value)} placeholder="https://cdn.example.com" />
      </label>
      <label>
        Entry File
        <input value={entryFile} onChange={(e) => setEntryFile(e.target.value)} placeholder="remoteEntry.js" />
      </label>
      <button onClick={() => onSave({ gitlabUrl, projectPath, jsonPath, s3BaseUrl, entryFile })}>
        Save Repository Settings
      </button>

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
