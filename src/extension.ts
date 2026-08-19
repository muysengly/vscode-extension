import * as path from "path";
import * as vscode from "vscode";

const TERMINAL_NAME = "OpenCode";

function toRelativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}

function findOpenCodeTerminal(): vscode.Terminal | undefined {
  return vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
}

function createOpenCodeTerminal(): vscode.Terminal {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
  const windir = process.env.windir ?? "C:\\Windows";

  const terminal = vscode.window.createTerminal({
    name: TERMINAL_NAME,
    shellPath: path.join(windir, "System32", "cmd.exe"),
    cwd,
  });

  terminal.show();
  terminal.sendText("opencode");

  return terminal;
}

function openOpenCodeTerminal(): vscode.Terminal {
  const existing = findOpenCodeTerminal();

  if (existing) {
    existing.dispose();
  }

  return createOpenCodeTerminal();
}

function sendToTerminal(text: string, message: string): void {
  const terminal = findOpenCodeTerminal();

  if (!terminal) {
    vscode.window.showWarningMessage("OpenCode terminal is not active.");
    return;
  }

  terminal.show();
  terminal.sendText(`\x1b[200~${text}\n\x1b[201~`, false);
  vscode.window.setStatusBarMessage(message, 3000);
}

export function activate(context: vscode.ExtensionContext) {
  const open = vscode.commands.registerCommand("extension.open", () => {
    openOpenCodeTerminal();
  });

  const send = vscode.commands.registerCommand("extension.send", () => {
    if (!findOpenCodeTerminal()) {
      createOpenCodeTerminal();
      vscode.window.setStatusBarMessage("OpenCode terminal opened.", 3000);
      return;
    }

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
      startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;

    const reference = `@${file}#${range}`;

    sendToTerminal(reference, `OpenCode reference sent: ${reference}`);
  });

  context.subscriptions.push(open, send);
}

export function deactivate() { }