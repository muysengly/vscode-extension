"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
function toRelativePath(uri) {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}
function sendToTerminal(text, message) {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
        vscode.window.showWarningMessage("OpenCode terminal is not active.");
        return;
    }
    terminal.show();
    terminal.sendText(`\x1b[200~${text}\n\x1b[201~`, true);
    vscode.window.setStatusBarMessage(message, 3000);
}
function openOpenCodeTerminal() {
    const existing = vscode.window.terminals.find((t) => t.name === "OpenCode");
    if (existing) {
        return existing;
    }
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
    const terminal = vscode.window.createTerminal({
        name: "OpenCode",
        cwd,
    });
    terminal.sendText("opencode");
    return terminal;
}
function activate(context) {
    const open = vscode.commands.registerCommand("extension.open", () => {
        const terminal = openOpenCodeTerminal();
        terminal.show();
    });
    const send = vscode.commands.registerCommand("extension.send", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const document = editor.document;
        if (document.uri.scheme === "untitled") {
            vscode.window.showWarningMessage("Cannot reference an unsaved file. Save it first.");
            return;
        }
        const selection = editor.selection;
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const file = toRelativePath(document.uri);
        const range = startLine === endLine
            ? `L${startLine}`
            : `L${startLine}-${endLine}`;
        const reference = `@${file}#${range}`;
        sendToTerminal(reference, `OpenCode reference sent: ${reference}`);
    });
    context.subscriptions.push(open, send);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map