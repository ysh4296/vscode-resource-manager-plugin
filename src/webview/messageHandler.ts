import { DeploymentService } from "../services/deploymentService";
import { RegistryService } from "../services/registryService";
import { ExtensionResponse, WebviewRequest } from "./messages";

/**
 * Translates each WebviewRequest into RegistryService/DeploymentService
 * calls and posts back a typed ExtensionResponse. This is the only place
 * that knows how the two services compose — the webview never calls them
 * directly.
 */
export class MessageHandler {
  constructor(
    private readonly registryService: RegistryService,
    private readonly deploymentService: DeploymentService,
    private readonly post: (response: ExtensionResponse) => void
  ) {}

  async handle(request: WebviewRequest): Promise<void> {
    try {
      switch (request.type) {
        case "getState": {
          this.post({ type: "state", state: await this.registryService.getState() });
          return;
        }
        case "saveConfig": {
          await this.registryService.saveConfig(request.config);
          this.post({ type: "state", state: await this.registryService.getState() });
          return;
        }
        case "saveToken": {
          await this.registryService.saveToken(request.token);
          this.post({ type: "state", state: await this.registryService.getState() });
          return;
        }
        case "getPackageVersions": {
          const versions = await this.registryService.getPackageVersions(request.resourceName);
          this.post({ type: "packageVersions", resourceName: request.resourceName, versions });
          return;
        }
        case "checkCandidate": {
          const result = await this.registryService.checkCandidate(request.resourceName, request.version);
          this.post({ type: "candidateCheckResult", result });
          return;
        }
        case "registerVersion": {
          const result = await this.registryService.registerVersion(request.resourceName, request.version);
          const state = result.success ? await this.registryService.getState() : undefined;
          this.post({ type: "registerVersionResult", ...result, state });
          return;
        }
        case "setActiveVersion": {
          const result = await this.registryService.setActiveVersion(request.resourceName, request.version);
          const state = result.success ? await this.registryService.getState() : undefined;
          this.post({ type: "setActiveVersionResult", ...result, state });
          return;
        }
        case "addResource": {
          const result = await this.registryService.addResource(request.resourceName, request.version);
          const state = result.success ? await this.registryService.getState() : undefined;
          this.post({ type: "addResourceResult", ...result, state });
          return;
        }
        case "validate": {
          const report = await this.registryService.validate();
          this.post({ type: "validationResult", report });
          return;
        }
        case "getDiff": {
          const diffResult = await this.deploymentService.getDiff();
          this.post({ type: "diffResult", ...diffResult });
          return;
        }
        case "commit": {
          try {
            await this.deploymentService.commit(request.message);
            this.post({ type: "commitResult", success: true });
          } catch (err) {
            this.post({ type: "commitResult", success: false, message: err instanceof Error ? err.message : String(err) });
          }
          return;
        }
        case "checkRemoteStatus": {
          const status = await this.deploymentService.checkRemoteStatus();
          this.post({ type: "remoteStatusResult", status });
          return;
        }
        case "push": {
          // Pre-push gate: re-validate everything right before pushing,
          // independent of whatever the user last saw in the Validation panel.
          const report = await this.registryService.validate();
          if (!report.ok) {
            this.post({
              type: "pushResult",
              success: false,
              blocked: true,
              message: "Validation failed. Fix the issues shown in the Validation panel before pushing.",
            });
            return;
          }
          const result = await this.deploymentService.push();
          this.post({ type: "pushResult", ...result });
          return;
        }
      }
    } catch (err) {
      this.post({
        type: "error",
        requestType: request.type,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
