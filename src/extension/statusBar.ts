import * as vscode from 'vscode';

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

  constructor() {
    this.item.command = 'sportsSimulator.open';
    this.item.tooltip = 'Sports Simulator: open';
    this.item.name = 'Sports Simulator';
  }

  update(text: string | null, tooltip?: string): void {
    if (text) {
      this.item.text = text;
      this.item.tooltip = tooltip === undefined ? 'Sports Simulator: open' : new vscode.MarkdownString(tooltip);
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
