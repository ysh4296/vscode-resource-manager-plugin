import React, { useState } from "react";

export interface AddResourceFormProps {
  existingNames: string[];
  onAdd: (resourceName: string, microserviceUrl: string, cdnBaseUrl: string) => void;
}

const EMPTY = { name: "", microserviceUrl: "", cdnBaseUrl: "" };

export function AddResourceForm({ existingNames, onAdd }: AddResourceFormProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  const nameTaken = existingNames.includes(draft.name.trim());
  const canSubmit = draft.name.trim() && draft.microserviceUrl.trim() && draft.cdnBaseUrl.trim() && !nameTaken;

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }
    onAdd(draft.name.trim(), draft.microserviceUrl.trim(), draft.cdnBaseUrl.trim());
    setDraft(EMPTY);
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="add-resource-toggle" onClick={() => setOpen(true)}>
        + Add Resource
      </button>
    );
  }

  return (
    <form className="panel add-resource-form" onSubmit={submit}>
      <h3>Add Resource</h3>
      <label>
        Resource Name
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="app3"
          autoFocus
        />
      </label>
      {nameTaken && <p className="status-bad">Resource "{draft.name.trim()}" already exists.</p>}
      <label>
        Microservice URL
        <input
          value={draft.microserviceUrl}
          onChange={(e) => setDraft({ ...draft, microserviceUrl: e.target.value })}
          placeholder="https://gitlab.example.com/group/subgroup/repo"
        />
      </label>
      <label>
        CDN Base URL
        <input
          value={draft.cdnBaseUrl}
          onChange={(e) => setDraft({ ...draft, cdnBaseUrl: e.target.value })}
          placeholder="https://cdn.example.com"
        />
      </label>
      <p className="hint">
        The version is read automatically from this resource's package.json on GitLab — whatever it currently says
        becomes the resource's first registered version.
      </p>
      <div className="location-edit-actions">
        <button type="submit" disabled={!canSubmit}>
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
