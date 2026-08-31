# MFE Resource Registry

VS Code extension for managing a multi-MFE deployment registry (`resources.json`). It reads real version data from each MFE's own GitLab Package Registry, lets you activate a version through the UI, tracks deploy history per host release, and runs the Git diff/commit/push workflow — all without hand-editing JSON or typing S3 URLs.

## What it does

- Auto-registers new versions: any version published in a resource's own GitLab project shows up in `resources.json` automatically (checked on open and every 30s) — no manual "register" step.
- Generates the S3/CDN URL for each version from a fixed rule (`{s3BaseUrl}/{resourceName}/{version}/{entryFile}`), so nobody types a URL by hand.
- Lets you activate a registered version ("Set Active") only after confirming it still exists in GitLab.
- Records a deploy-history snapshot automatically whenever the managed repo's own `package.json` version changes, capturing every resource's active version at that point.
- Runs Validation, Git diff, commit, and push from the same UI, blocking push if validation fails or the remote branch has moved.

## Install

```bash
npm install
npm run build          # bundles dist/extension.js and dist/webview/*
```

To try it in an Extension Development Host, open this folder in VS Code and press `F5`.

To install as a normal extension:

```bash
npx vsce package --allow-missing-repository   # needs Node 18+
code --install-extension mfe-resource-registry-0.1.0.vsix
```

## Setup

1. Open the folder that contains (or should contain) your `resources.json` as a VS Code workspace — **not** this extension's own source folder.
2. Click the extension's icon in the Activity Bar (left sidebar).
3. In the **Settings** tab, fill in:

   | Field | Meaning |
   |---|---|
   | GitLab URL | Your GitLab instance, e.g. `https://gitlab.example.com` |
   | JSON Path | Path to the registry file, relative to the workspace root (default `resources.json`) |
   | S3 Base URL | Base URL used to generate resource URLs, e.g. `https://cdn.example.com` |
   | Entry File | File name appended to generated URLs, e.g. `remoteEntry.js` |
   | Token | A GitLab Personal Access Token with `read_api` scope. Stored only in VS Code's SecretStorage — never in `resources.json` or git. |

There is no global "GitLab project" setting — each MFE lives in its own GitLab repo, so the project path is set **per resource**, inside `resources.json` (see below).

## `resources.json` schema

```json
{
  "resources": {
    "app1": {
      "gitlabProject": "frontend/app1",
      "current": "1.4.0",
      "versions": {
        "1.5.0": { "url": "https://cdn.example.com/app1/1.5.0/remoteEntry.js" },
        "1.4.0": { "url": "https://cdn.example.com/app1/1.4.0/remoteEntry.js" }
      }
    }
  }
}
```

- `gitlabProject` — the GitLab project (path or numeric ID) whose Package Registry holds this resource's versions. **Not auto-discovered** — the tool has no way to know which repo an app lives in, so this is set once per resource. Click the project label under a resource's name in the **Resources** tab to set or change it (verified against GitLab before saving, if a token is configured).
- `current` — the active version; must be a key in `versions`.
- `versions[version].url` — generated via the URL rule above, not typed by hand. Once a version is auto-registered, this is written for you.

To onboard a brand-new resource, add its entry with a `gitlabProject` and at least one real, published version — after that, auto-registration and Set Active take over.

## How version data flows

```
GitLab Package Registry (per resource's own project)
        │  GET /api/v4/projects/{gitlabProject}/packages
        ▼
  auto-register new versions into resources.json
        │
        ▼
  user clicks "Set Active" (re-checks GitLab existence first)
        │
        ▼
  resources.json committed + pushed
```

S3 is where the artifact happens to be uploaded — its URL is generated from the rule above, but its existence is **not** verified by the extension. GitLab Package Registry is the single source of truth for "does this version exist."

## Deploy History

Whenever the managed repo's own `package.json` `version` field changes (and doesn't already have a snapshot), the extension writes `deploy-history/<version>.json`:

```json
{
  "hostVersion": "2.1.0",
  "recordedAt": "2026-08-31T12:00:00.000Z",
  "resources": { "app1": "1.5.0", "app2": "2.3.0" }
}
```

This lets you answer "which app versions shipped with host version X?" later. Browse recorded snapshots in the **Deploy History** tab. The file flows through the normal diff/commit/push pipeline like any other change — it isn't pushed on its own.

## Git workflow (Validate & Push tab)

1. **Run Validation** — checks JSON structure, that `current` is a registered version, that URLs match the generation rule, and that every registered version still exists in GitLab.
2. **Refresh Diff** — shows the real `git diff` for `resources.json` and `deploy-history/`.
3. **Commit** — stages both paths and commits (default message is auto-generated from what changed).
4. **Fetch & Check Remote** — fetches `origin` and blocks push if the remote branch has moved ahead (never merges/rebases automatically).
5. **Push** — re-runs full validation right before pushing; blocked on any failure.

Git operations use the same `git` binary your terminal uses (via `simple-git`), with your existing SSH/credential setup — the extension has no separate auth path for git push.

## Known gaps

- No UI to add a brand-new resource entry — edit `resources.json` directly for that today (a resource's `gitlabProject` can be set/edited from the Resources tab by clicking it, once the resource already exists).
- Auto-registration assumes each GitLab project's Package Registry is dedicated to one resource (no `package_name` filtering) — if a project publishes multiple unrelated packages, all of them are treated as versions of that resource.
