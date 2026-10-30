import * as vscode from 'vscode';
import type { ToHost, ToWebview } from '../shared/view';

export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'sportsSimulator.view';
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: ToHost) => void,
  ) {}

  /** What the box's title bar shows while it's collapsed, and the badge for a decision waiting. */
  private info: { description?: string; badge?: vscode.ViewBadge } = {};

  get visible(): boolean {
    return this.view?.visible ?? false;
  }

  /** The description only shows while the box is collapsed, where the header can't be seen. */
  setInfo(description: string | undefined, badge: vscode.ViewBadge | undefined): void {
    this.info = { description, badge };
    this.applyInfo();
  }

  private applyInfo(): void {
    if (!this.view) return;
    const description = this.view.visible ? undefined : this.info.description;
    if (this.view.description !== description) this.view.description = description;
    if (this.view.badge?.value !== this.info.badge?.value) this.view.badge = this.info.badge;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.applyInfo();
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m: ToHost) => this.onMessage(m));
    view.onDidChangeVisibility(() => {
      this.applyInfo();
      if (view.visible) this.onMessage({ type: 'ready' });
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  post(message: ToWebview): void {
    if (this.view?.visible) void this.view.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Sports Simulator</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
