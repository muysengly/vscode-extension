"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require("path");
const vscode = require("vscode");
const TERMINAL_NAME = "OpenCode";
function toRelativePath(uri) {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}
function findOpenCodeTerminal() {
    return vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
}
function openOpenCodeTerminal() {
    const existing = findOpenCodeTerminal();
    if (existing) {
        return existing;
    }
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
    const windir = process.env.windir ?? "C:\\Windows";
    return vscode.window.createTerminal({
        name: TERMINAL_NAME,
        shellPath: path.join(windir, "System32", "cmd.exe"),
        shellArgs: ["/k", "opencode"],
        cwd,
        hideFromUser: true,
    });
}
function sendToTerminal(text, message) {
    const terminal = findOpenCodeTerminal();
    if (!terminal) {
        vscode.window.showWarningMessage("OpenCode terminal is not active.");
        return;
    }
    terminal.show();
    terminal.sendText(`\x1b[200~${text}\x1b[201~`, false);
    vscode.window.setStatusBarMessage(message, 3000);
}
function activate(context) {
    const open = vscode.commands.registerCommand("extension.open", () => {
        openOpenCodeTerminal().show();
    });
    const send = vscode.commands.registerCommand("extension.send", () => {
        if (!findOpenCodeTerminal()) {
            openOpenCodeTerminal().show();
            vscode.window.setStatusBarMessage("OpenCode terminal opened.", 3000);
            return;
        }
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