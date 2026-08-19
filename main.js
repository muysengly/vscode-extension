const vscode = require("vscode");

/**
 * @param {import("vscode").ExtensionContext} context
 */
function activate(context) {
  const command = vscode.commands.registerCommand(
    "extension.send",
    () => {
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

      const file = vscode.workspace
        .asRelativePath(document.uri, false)
        .replace(/\\/g, "/");

      const range =
        startLine === endLine
          ? `L${startLine}`
          : `L${startLine}-${endLine}`;

      const reference = `@${file}#${range}`;
      const pasted = `\x1b[200~${reference}\n\n\x1b[201~`;

      const terminal = vscode.window.activeTerminal;

      if (!terminal) {
        vscode.window.showWarningMessage(
          "OpenCode terminal is not active."
        );
        return;
      }

      terminal.show();
      vscode.commands.executeCommand(
        "workbench.action.terminal.sendSequence",
        { text: pasted }
      );

      vscode.window.setStatusBarMessage(
        `OpenCode reference sent: ${reference}`,
        3000
      );
    }
  );

  context.subscriptions.push(command);
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
