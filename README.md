# MFE Resource Registry

여러 MFE(마이크로 프론트엔드)의 배포 버전을 관리하는 `resources.json`을 위한 VS Code 확장입니다. 각 MFE 자신의 GitLab 프로젝트 기본 브랜치에 있는 `package.json`의 `version` 필드를 읽어와 실제 버전 정보를 파악해서 활성 버전까지 자동으로 반영하고, 호스트 릴리즈별 배포 이력을 기록하고, Git diff/commit/push까지 한 화면에서 처리합니다 — JSON을 손으로 편집하거나 CDN URL을 직접 타이핑할 필요 없이요.

## 하는 일

- **버전 자동 등록 + 활성화**: 어떤 리소스의 GitLab 프로젝트 기본 브랜치에서 `package.json`의 `version`이 바뀌면 `resources.json`에 자동으로 등록되고, 그 즉시 `current`(활성 버전)로도 반영됩니다 (화면을 열 때, 그리고 30초마다 확인) — 별도로 git 태그를 찍거나 패키지를 게시할 필요 없이, 그 레포에 커밋된 `package.json`만 정확하면 됩니다. GitLab은 리소스마다 "지금 살아있는 버전" 하나만 알려주기 때문에 등록과 활성화를 가를 이유가 없어서, 수동으로 "등록"이나 "Set Active"를 누르는 단계 없이 감지 즉시 반영됩니다.
- **CDN URL 자동 생성**: 리소스별로 매핑한 CDN base URL과 마이크로서비스 URL에서 뽑아낸 프로젝트 경로를 조합한 고정 규칙(`{cdnBaseUrl}/{projectPath}/{version}/{entryFile}`)으로 각 버전의 URL을 만들어주기 때문에, 사람이 URL을 직접 타이핑하지 않습니다. 리소스마다 다른 GitLab 인스턴스/CDN/버킷을 쓸 수 있습니다.
- **배포 이력 자동 기록**: 관리 대상 레포 자체의 `package.json` 버전이 바뀔 때마다, 그 시점의 모든 리소스 활성 버전을 스냅샷으로 자동 저장합니다.
- **Validation → Git diff → Commit → Push**를 한 화면에서 처리하며, 검증 실패나 원격 브랜치 변경이 감지되면 push를 막습니다.

## 설치

이 프로젝트는 **yarn**(Classic, 1.x)으로 관리합니다 — `yarn.lock`이 기준이고 `package-lock.json`은 없습니다.

```bash
yarn install
yarn build          # dist/extension.js와 dist/webview/* 번들 생성
```

Extension Development Host로 바로 테스트하려면 이 폴더를 VS Code로 열고 `F5`를 누르면 됩니다.

일반 확장으로 설치하려면:

```bash
npx vsce package --allow-missing-repository   # yarn.lock을 자동 감지해서 yarn으로 빌드함. Node 18+ 필요
code --install-extension mfe-resource-registry-0.1.0.vsix
```

> `yarn`/`vsce`는 최신 Node API(`URL.canParse` 등)를 쓰기 때문에, 시스템 기본 Node가 18 미만이면(예: nvm으로 16.x가 기본인 경우) `nvm use 20` 또는 `nvm use 22`로 전환한 뒤 실행하세요.

## 초기 설정

이 확장은 **VS Code에 열려있는 폴더를 기준으로 동작하지 않습니다.** 대신 Settings에 입력한 레포 URL을 확장이 알아서 clone/관리합니다 — 그래서 아무 폴더도 안 열려있거나, 전혀 다른 프로젝트를 열어놓은 상태에서도 동작합니다.

1. 왼쪽 액티비티 바에서 확장 아이콘을 클릭합니다 (워크스페이스 유무와 무관하게 항상 열립니다).
2. **Settings** 탭에서 아래 항목을 입력합니다.

   | 항목 | 의미 |
   |---|---|
   | Repository URL | `resources.json`이 들어있는 레포의 git clone 주소 (SSH 또는 HTTPS), 예: `git@gitlab.example.com:group/mfe-resource-registry.git`. 확장이 이 레포를 내부 저장 공간에 알아서 clone합니다. |
   | JSON Path | **레포 루트** 기준 registry 파일 경로 (기본값 `resources.json`) |
   | Entry File | 생성되는 URL 끝에 붙는 파일명, 예: `remoteEntry.js` |
   | Token | `read_api` 스코프의 GitLab Personal Access Token. VS Code SecretStorage에만 저장되며, `resources.json`이나 git에는 절대 들어가지 않습니다. **모든 리소스가 이 토큰 하나를 공유합니다.** |

Repository URL을 clone하는 과정은 평소 터미널에서 `git clone`할 때 쓰는 것과 동일한 인증(SSH 키, HTTPS credential helper)을 그대로 사용합니다 — 확장이 별도의 git 인증 로직을 갖고 있지 않습니다.

전역 "GitLab URL"이나 "CDN Base URL" 설정은 없습니다 — MFE 구조에서는 앱마다 서로 다른 레포(경우에 따라 서로 다른 GitLab 인스턴스)와, (경우에 따라) 서로 다른 CDN/버킷을 갖기 때문에, 이 확장은 리소스 하나에 URL 하나만 두지 않고 **리소스별로 여러 개**를 `resources.json` 안에 저장합니다 (아래 참고). 각 리소스는 GitLab 인스턴스 주소까지 포함한 전체 URL(**Microservice URL**, 예: `https://gitlab.example.com/frontend/app1`)과 CDN base URL을 한 쌍으로 갖고, 여기서 GitLab 인스턴스와 프로젝트 경로를 파싱해냅니다. Repository URL과는 다른 개념입니다 — Repository URL은 `resources.json`을 담고 있는 "관리 레포" 하나를 가리키고, 리소스별 Microservice URL/CDN Base URL은 각 MFE 자신의 소스 레포와 배포 위치를 가리킵니다. 다만 **Token은 리소스마다 나뉘지 않고 하나만 공유**합니다 — 여러 GitLab 인스턴스를 걸쳐 쓰더라도 인증 정보는 위 Settings의 Token 하나로 처리됩니다 (같은 조직 내 인스턴스들이 같은 SSO/토큰 체계를 공유하는 걸 전제로 합니다. 완전히 별도 계정 체계를 쓰는 인스턴스가 섞여 있다면 해당 리소스의 GitLab 확인은 실패할 수 있습니다).

내부적으로 이 clone은 VS Code의 확장별 global storage 디렉토리 아래(`repos/<repositoryUrl의 해시>`)에 만들어집니다. Repository URL을 바꾸면 새 해시로 새 clone 경로를 쓰기 때문에, 레포를 바꿔가며 써도 매번 다시 clone하지 않습니다.

## `resources.json` 스키마

```json
{
  "resources": {
    "app1": {
      "microserviceUrl": "https://gitlab.example.com/frontend/app1",
      "cdnBaseUrl": "https://cdn.example.com",
      "current": "1.4.0",
      "versions": {
        "1.5.0": { "url": "https://cdn.example.com/frontend/app1/1.5.0/remoteEntry.js" },
        "1.4.0": { "url": "https://cdn.example.com/frontend/app1/1.4.0/remoteEntry.js" }
      }
    },
    "app2": {
      "microserviceUrl": "https://gitlab.other-instance.example.com/frontend/app2",
      "cdnBaseUrl": "https://static.otherhost.example.com",
      "current": "2.3.0",
      "versions": {
        "2.3.0": { "url": "https://static.otherhost.example.com/frontend/app2/2.3.0/remoteEntry.js" }
      }
    }
  }
}
```

- `microserviceUrl` — 이 리소스(하나의 마이크로 프론트엔드)의 GitLab 인스턴스와 프로젝트 경로를 함께 담은 **전체 URL**, 예: `https://gitlab.example.com/frontend/app1`. **자동으로 알아내지 않습니다** — 어떤 앱이 어느 GitLab 인스턴스의 어느 레포에 있는지는 도구가 알 방법이 없어서, 리소스별로 한 번 지정해줘야 합니다. 위 예시처럼 `app1`과 `app2`가 서로 다른 GitLab 인스턴스를 가리켜도 됩니다 — MFE마다 완전히 독립된 소스 레포/인스턴스를 쓸 수 있다는 전제입니다. 내부적으로는 origin(`https://gitlab.example.com`)과 경로(`frontend/app1`)로 파싱해서 각각 GitLab API 호출의 base URL과 project path로 씁니다.
- `cdnBaseUrl` — 이 리소스가 실제로 서빙되는 CDN/버킷의 base URL. 역시 리소스별로 지정하며, `microserviceUrl`과 무관한 별도 값입니다.

`microserviceUrl`과 `cdnBaseUrl`은 **Resources** 탭에서 리소스 이름 옆의 위치 텍스트(`https://gitlab.../frontend/app1 · https://cdn...`)를 클릭하면 **한 폼에서 같이** 입력/수정합니다. 저장 시 둘 다 검증합니다 — Settings에 설정한 공유 Token으로 `microserviceUrl`이 가리키는 프로젝트가 그 GitLab 인스턴스에 실제로 존재하는지, `cdnBaseUrl`은 그 호스트가 실제로 응답하는지(어떤 상태 코드든 응답만 오면 통과 — 특정 파일 존재 여부는 확인하지 않습니다) 확인하고, 하나라도 실패하면 저장되지 않습니다. **`microserviceUrl`을 바꾸면 기존 `versions`/`current`는 초기화**되지만(이전 프로젝트의 버전이 새 프로젝트 것과 섞이지 않도록), `cdnBaseUrl`만 바뀐 경우엔 그대로 유지됩니다 — 다만 기존에 저장된 `url` 값들은 새 규칙과 안 맞게 되어 Validation의 "URL matches rule" 체크에서 걸립니다.
- `current` — 활성 버전. 반드시 `versions`에 등록된 키여야 합니다.
- `versions[version].url` — `{cdnBaseUrl}/{microserviceUrl의 프로젝트 경로}/{version}/{entryFile}` 규칙으로 자동 생성되며 손으로 타이핑하지 않습니다. 버전이 자동 등록되면 같이 채워집니다.

완전히 새로운 리소스를 등록하려면 **Resources** 탭 맨 아래의 **+ Add Resource**를 눌러 이름/`microserviceUrl`/`cdnBaseUrl`만 입력하면 됩니다 — 버전은 따로 입력하지 않고, 그 GitLab 프로젝트의 `package.json`이 지금 가리키는 버전을 확장이 직접 읽어와 첫 버전으로 등록합니다 (읽어올 수 없으면 추가 자체가 거부됩니다). 그 이후부터는 자동 등록이 알아서 후속 버전을 반영합니다. 각 리소스 항목 오른쪽의 **Remove** 버튼(한 번 더 눌러 확인)으로 리소스를 완전히 제거할 수도 있습니다 — JSON을 직접 편집할 필요 없이 등록/제거 모두 UI에서 처리됩니다.

## 버전 데이터가 흘러가는 흐름

```
리소스 자신의 GitLab 프로젝트 (microserviceUrl이 가리키는 곳)
  기본 브랜치의 package.json
        │  GET {microserviceUrl의 인스턴스}/api/v4/projects/{경로}/repository/files/package.json/raw?ref={기본 브랜치}
        ▼
  version 필드 확인 (git 태그도, 패키지 게시도 필요 없음)
        │
        ▼
  resources.json에 새 버전 자동 등록 + current로 즉시 반영 (URL = {cdnBaseUrl}/{경로}/{version}/{entryFile})
        │
        ▼
  resources.json commit + push (사람이 확인 후 직접 수행)
```

CDN은 그저 빌드 산출물이 실제로 업로드되는 위치일 뿐입니다 — URL은 위 규칙으로 생성하지만, 그 URL에 실제 파일이 존재하는지는 이 확장이 검증하지 않습니다. "이 버전이 지금 살아있는가"에 대한 유일한 판단 기준은 그 리소스 자신의 GitLab `package.json`입니다. GitLab은 항상 "지금 이 순간의 버전" 하나만 알려주기 때문에, 이미 `resources.json`에 등록된 과거 버전들은 (호스트의 Deploy History처럼) 그 자체로 기록으로 남을 뿐 매번 GitLab과 다시 대조하지 않습니다 — 대조는 `current`로 지정된 버전에 대해서만 이뤄집니다.

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

## 테스트

```bash
yarn test
```

Node 내장 테스트 러너(`node:test`)와 `tsx`(TypeScript 실행용, 별도 설정 불필요)만 사용합니다. `vscode` 모듈에 의존하는 서비스/핸들러 계층(`registryService.ts`, `deploymentService.ts`, `messageHandler.ts` 등)은 실제 VS Code 없이 단위 테스트하기 어려워 제외했고, 순수 로직만 분리된 아래 모듈들을 다룹니다.

- `resource/buildResourceUrl.ts`, `registry/updater.ts`, `registry/validator.ts`, `registry/parser.ts`, `git/diff.ts`, `gitlab/client.ts`의 `encodeProjectId`, `gitlab/projectUrl.ts`
- `registry/deployHistory.ts`는 파일시스템 I/O가 있어서 임시 디렉토리(`os.tmpdir()`)로 실제 읽기/쓰기를 검증합니다.

네트워크가 필요한 부분(`gitlab/repositoryVersion.ts`, `gitlab/client.ts`의 `testConnection`, `util/http.ts`)은 실제 GitLab 인스턴스나 로컬 mock 서버가 있어야 해서 이 스위트에는 포함하지 않았습니다.

Node 18 미만에서는 `node --test`가 없으니, 이 저장소를 빌드/패키징할 때처럼 Node 20 이상을 PATH에 얹어서 실행하세요.

## 아직 없는 기능

- 자동 등록/검증은 그 리소스 GitLab 프로젝트의 **기본 브랜치**에 있는 `package.json`만 봅니다 — 다른 브랜치나 태그에 있는 버전은 인식하지 않으며, `package.json`이 없거나 `version` 필드가 없으면 그 라운드는 그냥 건너뜁니다.
- 이미 `resources.json`에 등록된 과거 버전은 그때 기록된 그대로 남아있을 뿐, GitLab과 다시 대조되지 않습니다 (대조는 `current`에 대해서만). 과거에 활성화됐던 버전들의 이력은 Deploy History에서 확인하세요.
