import type { ExtensionResponse, WebviewRequest } from "../messages";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

export function sendRequest(request: WebviewRequest): void {
  vscode.postMessage(request);
}

export function onResponse(listener: (response: ExtensionResponse) => void): () => void {
  const handler = (event: MessageEvent<ExtensionResponse>): void => listener(event.data);
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
