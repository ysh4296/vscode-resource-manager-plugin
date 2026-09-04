import * as vscode from "vscode";
import { RegistryPanel } from "./webview/panel";
import { RegistryViewProvider } from "./webview/viewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const viewProvider = new RegistryViewProvider(context.extensionUri, context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(RegistryViewProvider.viewType, viewProvider));

  const revealSidebar = async (): Promise<void> => {
    await vscode.commands.executeCommand("workbench.view.extension.mfeResourceRegistry");
  };

  const openInEditor = (): void => {
    RegistryPanel.createOrShow(context.extensionUri, context);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("mfeResourceRegistry.open", revealSidebar),
    vscode.commands.registerCommand("mfeResourceRegistry.configure", revealSidebar),
    vscode.commands.registerCommand("mfeResourceRegistry.openInEditor", openInEditor)
  );
}

export function deactivate(): void {}
