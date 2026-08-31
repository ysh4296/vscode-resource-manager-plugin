import React, { useEffect, useState } from "react";
import type { CandidateCheckResult, PackageVersionOption } from "../messages";

export interface RegisterVersionDialogProps {
  resourceName: string;
  versions: PackageVersionOption[];
  candidate: CandidateCheckResult | null;
  onLoadVersions: () => void;
  onSelectVersion: (version: string) => void;
  onRegister: (version: string) => void;
  onClose: () => void;
}

export function RegisterVersionDialog({
  resourceName,
  versions,
  candidate,
  onLoadVersions,
  onSelectVersion,
  onRegister,
  onClose,
}: RegisterVersionDialogProps): JSX.Element {
  const [selected, setSelected] = useState("");

  useEffect(() => {
    onLoadVersions();
    // Runs once when the dialog mounts for this resource.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candidates = versions.filter((v) => !v.alreadyRegistered);
  const selectedOption = candidates.find((v) => v.version === selected);
  const matchesSelection = Boolean(candidate && candidate.version === selected);
  const canRegister = matchesSelection && candidate!.gitlabExists && candidate!.s3 === "available";

  function handleSelect(version: string): void {
    setSelected(version);
    if (version) {
      onSelectVersion(version);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Register Version</h2>
        <p className="hint">Resource: {resourceName}</p>

        <label>
          Version
          <select value={selected} onChange={(e) => handleSelect(e.target.value)}>
            <option value="">Select a version...</option>
            {candidates.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
                {v.isSemver ? "" : " (non-semver)"}
              </option>
            ))}
          </select>
        </label>

        {candidates.length === 0 && <p className="hint">All GitLab package versions are already registered.</p>}

        {selectedOption && (
          <div className="candidate-preview">
            <div>
              <strong>Generated URL</strong>
              <div className="url">{selectedOption.generatedUrl}</div>
            </div>
            <div>
              GitLab Package:{" "}
              {!matchesSelection ? "checking..." : candidate!.gitlabExists ? "✅ Exists" : "❌ Not found"}
            </div>
            <div>
              S3 Resource:{" "}
              {!matchesSelection
                ? "checking..."
                : candidate!.s3 === "available"
                  ? "✅ Available"
                  : candidate!.s3 === "missing"
                    ? "❌ Missing"
                    : `⚠️ ${candidate!.s3}`}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button disabled={!canRegister} onClick={() => onRegister(selected)}>
            Register
          </button>
        </div>
      </div>
    </div>
  );
}
