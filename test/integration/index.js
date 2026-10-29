// Runs inside a VS Code extension host: node test/integration/run.mjs
const vscode = require('vscode');
const assert = require('assert');

exports.run = async function run() {
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'sideline');
  assert.ok(ext, 'extension found');
  await ext.activate();
  assert.ok(ext.isActive, 'extension active');
  const commands = await vscode.commands.getCommands(true);
  for (const c of ['sideline.open']) {
    assert.ok(commands.includes(c), `command ${c} registered`);
  }
  await vscode.commands.executeCommand('sideline.view.focus');
  await new Promise((r) => setTimeout(r, 1500));
  if (global.__sidelineTestHook) await global.__sidelineTestHook(vscode, assert);
  console.log('INTEGRATION OK');
};
