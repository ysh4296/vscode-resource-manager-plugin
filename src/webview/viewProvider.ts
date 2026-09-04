import * as vscode from "vscode";
import { wireWebview } from "./webviewHost";

/**
 * Renders the same React UI as RegistryPanel, but as an always-available
 * sidebar view (Activity Bar icon) instead of something the user has to
 * find through the Command Palette. Doesn't require a workspace folder to
 * be open — RegistryService manages its own clone of the configured repo.
 */
export class RegistryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mfeResourceRegistry.view";

  constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const disposable = wireWebview(webviewView.webview, this.extensionUri, this.context);
    webviewView.onDidDispose(() => disposable.dispose());
  }
}
