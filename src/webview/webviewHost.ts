import * as vscode from "vscode";
import { DeploymentService } from "../services/deploymentService";
import { RegistryService } from "../services/registryService";
import { MessageHandler } from "./messageHandler";
import { ExtensionResponse, WebviewRequest } from "./messages";

function getNonce(): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css"));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>MFE Resource Registry</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Wires up a VS Code webview — whether it's hosted in an editor-tab
 * WebviewPanel or a sidebar WebviewView, both expose the same `vscode.Webview`
 * surface — to a fresh RegistryService/DeploymentService pair. Shared so the
 * sidebar view and the "open in editor tab" panel don't duplicate this logic.
 *
 * Not tied to any VS Code workspace folder: RegistryService manages its own
 * local clone of the configured repository under the extension's global
 * storage directory, so this works whether or not a folder is open.
 */
export function wireWebview(webview: vscode.Webview, extensionUri: vscode.Uri, context: vscode.ExtensionContext): vscode.Disposable {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
  };
  webview.html = getWebviewHtml(webview, extensionUri);

  const registryService = new RegistryService(context, context.globalStorageUri.fsPath);
  const deploymentService = new DeploymentService(registryService);
  const post = (response: ExtensionResponse): void => {
    void webview.postMessage(response);
  };
  const messageHandler = new MessageHandler(registryService, deploymentService, post);

  return webview.onDidReceiveMessage((message: WebviewRequest) => {
    void messageHandler.handle(message);
  });
}
