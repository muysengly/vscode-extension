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
  vscode.commands.executeCommand("workbench.action.terminal.sendSequence", {
    text: `\x1b[200~${text}\n\n\x1b[201~`
  });
  vscode.window.setStatusBarMessage(message, 3000);
}

export function activate(context: vscode.ExtensionContext) {
  const sendFromExplorer = vscode.commands.registerCommand(
    "extension.sendFromExplorer",
    async (resource: vscode.Uri | { uri: vscode.Uri } | undefined) => {
      const uris: vscode.Uri[] = [];

      if (resource instanceof vscode.Uri) {
        uris.push(resource);
      } else if (resource) {
        uris.push(resource.uri);
      } else {
        const original = await vscode.env.clipboard.readText();

        try {
          await vscode.commands.executeCommand("copyFilePath");
        } catch (error) {
          vscode.window.showWarningMessage(
            "No file or folder is selected in the Explorer."
          );
          return;
        }

        const copied = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(original);

        for (const p of copied
          .split(/\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean)) {
          uris.push(vscode.Uri.file(p));
        }
      }

      if (uris.length === 0) {
        return;
      }

      const references = uris.map((uri) => `@${toRelativePath(uri)}`);
      const pasted = references.join(" ");

      sendToTerminal(pasted, `OpenCode reference sent: ${pasted}`);
    }
  );

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

  context.subscriptions.push(sendFromExplorer, send);
}

export function deactivate() {}