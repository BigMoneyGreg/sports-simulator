import * as vscode from 'vscode';
import { SidebarProvider } from './sidebar';

export function activate(context: vscode.ExtensionContext): void {
  const sidebar = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar, {
      webviewOptions: { retainContextWhenHidden: false },
    }),
    vscode.commands.registerCommand('sideline.open', () => {
      void vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`);
    }),
  );
}

export function deactivate(): void {}
