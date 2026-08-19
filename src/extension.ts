import * as vscode from "vscode";

function toRelativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}

function sendToTerminal(text: string, message: string): void {
  const terminal = vscode.window.activeTerminal;

  if (!terminal) {
    vscode.window.showWarningMessage("OpenCode terminal is not active.");
    return;
  }

  terminal.show();
  terminal.sendText(text, true);
  vscode.window.setStatusBarMessage(message, 3000);
}

export function activate(context: vscode.ExtensionContext) {
  const send = vscode.commands.registerCommand("extension.send", () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return;
    }

    const document = editor.document;

    if (document.uri.scheme === "untitled") {
      vscode.window.showWarningMessage(
        "Cannot reference an unsaved file. Save it first."
      );
      return;
    }

    const selection = editor.selection;
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    const file = toRelativePath(document.uri);
    const range =
      startLine === endLine
        ? `L${startLine}`
        : `L${startLine}-${endLine}`;

    const reference = `@${file}#${range}`;

    sendToTerminal(reference, `OpenCode reference sent: ${reference}`);
  });

  context.subscriptions.push(send);
}

export function deactivate() { }