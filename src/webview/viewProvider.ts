import * as vscode from "vscode";
import { wireWebview } from "./webviewHost";

/**
 * Renders the same React UI as RegistryPanel, but as an always-available
 * sidebar view (Activity Bar icon) instead of something the user has to
 * find through the Command Palette.
 */
export class RegistryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mfeResourceRegistry.view";

  constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
      webviewView.webview.options = { enableScripts: false };
      webviewView.webview.html = this.getNoWorkspaceHtml();
      return;
    }

    const disposable = wireWebview(webviewView.webview, this.extensionUri, this.context, workspaceRoot);
    webviewView.onDidDispose(() => disposable.dispose());
  }

  private getNoWorkspaceHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="font-family: var(--vscode-font-family, sans-serif); padding: 16px; color: var(--vscode-foreground);">
  <p>Open a workspace folder to use MFE Resource Registry.</p>
</body>
</html>`;
  }
}
