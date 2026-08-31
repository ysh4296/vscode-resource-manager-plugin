# MFE Resource Registry

여러 MFE(마이크로 프론트엔드)의 배포 버전을 관리하는 `resources.json`을 위한 VS Code 확장입니다. 각 MFE 자신의 GitLab Package Registry에서 실제 버전 정보를 읽어오고, UI에서 버전을 활성화(Set Active)할 수 있게 해주며, 호스트 릴리즈별 배포 이력을 기록하고, Git diff/commit/push까지 한 화면에서 처리합니다 — JSON을 손으로 편집하거나 S3 URL을 직접 타이핑할 필요 없이요.

## 하는 일

- **버전 자동 등록**: 어떤 리소스의 GitLab 프로젝트에 새 버전이 올라오면 `resources.json`에 자동으로 등록됩니다 (화면을 열 때, 그리고 30초마다 확인) — 수동으로 "등록" 버튼을 누를 필요가 없습니다.
- **S3/CDN URL 자동 생성**: 고정된 규칙(`{s3BaseUrl}/{resourceName}/{version}/{entryFile}`)으로 각 버전의 URL을 만들어주기 때문에, 사람이 URL을 직접 타이핑하지 않습니다.
- **Set Active**: 등록된 버전 중 GitLab에 실제로 존재하는지 다시 한번 확인한 뒤에만 활성화할 수 있습니다.
- **배포 이력 자동 기록**: 관리 대상 레포 자체의 `package.json` 버전이 바뀔 때마다, 그 시점의 모든 리소스 활성 버전을 스냅샷으로 자동 저장합니다.
- **Validation → Git diff → Commit → Push**를 한 화면에서 처리하며, 검증 실패나 원격 브랜치 변경이 감지되면 push를 막습니다.

## 설치

```bash
npm install
npm run build          # dist/extension.js와 dist/webview/* 번들 생성
```

Extension Development Host로 바로 테스트하려면 이 폴더를 VS Code로 열고 `F5`를 누르면 됩니다.

일반 확장으로 설치하려면:

```bash
npx vsce package --allow-missing-repository   # Node 18+ 필요
code --install-extension mfe-resource-registry-0.1.0.vsix
```

## 초기 설정

1. `resources.json`이 있는(또는 앞으로 관리할) 폴더를 VS Code 워크스페이스로 엽니다 — **이 확장 자체의 소스 폴더가 아닙니다.**
2. 왼쪽 액티비티 바에서 확장 아이콘을 클릭합니다.
3. **Settings** 탭에서 아래 항목을 입력합니다.

   | 항목 | 의미 |
   |---|---|
   | GitLab URL | 사용 중인 GitLab 인스턴스, 예: `https://gitlab.example.com` |
   | JSON Path | 워크스페이스 루트 기준 registry 파일 경로 (기본값 `resources.json`) |
   | S3 Base URL | 리소스 URL 생성에 쓰이는 base URL, 예: `https://cdn.example.com` |
   | Entry File | 생성되는 URL 끝에 붙는 파일명, 예: `remoteEntry.js` |
   | Token | `read_api` 스코프의 GitLab Personal Access Token. VS Code SecretStorage에만 저장되며, `resources.json`이나 git에는 절대 들어가지 않습니다. |

전역 "GitLab Project" 설정은 없습니다 — 각 MFE가 자기만의 GitLab 레포를 갖고 있기 때문에, 프로젝트 경로는 **리소스별로** `resources.json` 안에 저장됩니다 (아래 참고).

## `resources.json` 스키마

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

- `gitlabProject` — 이 리소스의 버전이 올라오는 GitLab 프로젝트(경로 또는 숫자 ID). **자동으로 알아내지 않습니다** — 어떤 앱이 어느 레포에 있는지는 도구가 알 방법이 없어서, 리소스별로 한 번 지정해줘야 합니다. **Resources** 탭에서 리소스 이름 아래 프로젝트 경로를 클릭하면 입력/수정할 수 있고(토큰이 설정돼 있으면 저장 전에 GitLab에 실제로 존재하는지 확인합니다), **이 값을 바꾸면 기존 versions/current는 초기화됩니다** (이전 프로젝트의 버전이 새 프로젝트 것과 섞이지 않도록).
- `current` — 활성 버전. 반드시 `versions`에 등록된 키여야 합니다.
- `versions[version].url` — 위 규칙으로 자동 생성되며 손으로 타이핑하지 않습니다. 버전이 자동 등록되면 같이 채워집니다.

완전히 새로운 리소스를 등록하려면, `gitlabProject`와 실제로 배포된 버전 하나를 넣어서 항목을 추가하면 됩니다 — 그 이후부터는 자동 등록과 Set Active가 알아서 처리합니다. (지금은 이 최초 항목 추가를 위한 UI가 없어서 JSON을 직접 편집해야 합니다 — 아래 "아직 없는 기능" 참고)

## 버전 데이터가 흘러가는 흐름

```
GitLab Package Registry (리소스 자신의 프로젝트)
        │  GET /api/v4/projects/{gitlabProject}/packages
        ▼
  resources.json에 새 버전 자동 등록
        │
        ▼
  사용자가 "Set Active" 클릭 (GitLab에 존재하는지 다시 확인)
        │
        ▼
  resources.json commit + push
```

S3는 그저 빌드 산출물이 실제로 업로드되는 위치일 뿐입니다 — URL은 위 규칙으로 생성하지만, 그 URL에 실제 파일이 존재하는지는 이 확장이 검증하지 않습니다. "이 버전이 존재하는가"에 대한 유일한 판단 기준은 GitLab Package Registry입니다.

## Deploy History (배포 이력)

관리 대상 레포 자체의 `package.json`의 `version` 필드가 바뀌었는데 아직 그 버전의 스냅샷이 없으면, 확장이 `deploy-history/<버전>.json`을 자동으로 생성합니다.

```json
{
  "hostVersion": "2.1.0",
  "recordedAt": "2026-08-31T12:00:00.000Z",
  "resources": { "app1": "1.5.0", "app2": "2.3.0" }
}
```

이걸 보면 나중에 "호스트 버전 X를 배포했을 때 어떤 app이 어떤 버전이었나"를 되짚어볼 수 있습니다. 기록된 스냅샷은 **Deploy History** 탭에서 확인합니다. 이 파일도 다른 변경사항과 마찬가지로 평소의 diff/commit/push 흐름을 그대로 타고 올라갑니다 — 단독으로 push되지 않습니다.

## Git 워크플로 (Validate & Push 탭)

1. **Run Validation** — JSON 구조, `current`가 등록된 버전인지, URL이 생성 규칙과 일치하는지, 등록된 모든 버전이 GitLab에 실제로 존재하는지를 검사합니다.
2. **Refresh Diff** — `resources.json`과 `deploy-history/`에 대한 실제 `git diff` 결과를 보여줍니다.
3. **Commit** — 두 경로를 모두 스테이징하고 커밋합니다 (커밋 메시지는 변경 내용을 바탕으로 기본값이 자동 생성됩니다).
4. **Fetch & Check Remote** — `origin`을 fetch해서 원격 브랜치가 앞서 나갔으면 push를 막습니다 (자동으로 merge/rebase하지 않습니다).
5. **Push** — push 직전에 전체 Validation을 한 번 더 돌리고, 하나라도 실패하면 막습니다.

Git 작업은 터미널에서 쓰는 것과 같은 `git` 실행 파일을 그대로 사용하고(`simple-git` 경유), 기존에 설정된 SSH/credential을 그대로 씁니다 — 확장이 별도의 인증 로직을 갖고 있지 않습니다.

## 아직 없는 기능

- 완전히 새로운 리소스를 UI에서 추가하는 기능은 없습니다 — 지금은 `resources.json`을 직접 편집해서 첫 항목을 만들어야 합니다 (일단 리소스가 존재하면, 그 이후의 `gitlabProject` 수정은 Resources 탭에서 가능).
- 자동 등록은 "GitLab 프로젝트 하나 = 리소스 하나"라고 가정합니다 (`package_name`으로 필터링하지 않음) — 한 프로젝트가 서로 무관한 여러 패키지를 배포한다면, 그것들이 전부 그 리소스의 버전으로 취급됩니다.
- 자동화된 테스트 코드는 아직 없습니다. 다만 핵심 로직(`buildResourceUrl`, `registry/updater.ts`, `registry/validator.ts`, `git/diff.ts`의 diff 요약 함수 등)은 외부 I/O 없이 순수 함수로 분리돼 있어서 테스트를 붙이기 쉬운 구조입니다.
