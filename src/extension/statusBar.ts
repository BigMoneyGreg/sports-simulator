import * as vscode from 'vscode';

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

  constructor() {
    this.item.command = 'sideline.open';
    this.item.tooltip = 'Sideline: open';
    this.item.name = 'Sideline';
  }

  update(text: string | null): void {
    if (text) {
      this.item.text = text;
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
