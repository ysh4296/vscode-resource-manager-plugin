import * as vscode from "vscode";
import { wireWebview } from "./webviewHost";

/**
 * Opens the same UI as the sidebar view, but as a full editor-tab panel —
 * useful when the sidebar is too narrow to work in comfortably. Doesn't
 * require a workspace folder to be open — RegistryService manages its own
 * clone of the configured repo.
 */
export class RegistryPanel {
  public static currentPanel: RegistryPanel | undefined;
  private static readonly viewType = "mfeResourceRegistryPanel";

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (RegistryPanel.currentPanel) {
      RegistryPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(RegistryPanel.viewType, "MFE Resource Registry", column ?? vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
    });

    RegistryPanel.currentPanel = new RegistryPanel(panel, extensionUri, context);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this.panel = panel;

    const messageDisposable = wireWebview(panel.webview, extensionUri, context);
    this.disposables.push(messageDisposable);

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  private dispose(): void {
    RegistryPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
