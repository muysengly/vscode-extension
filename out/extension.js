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
function createOpenCodeTerminal(context) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
    const windir = process.env.windir ?? "C:\\Windows";
    const iconPath = vscode.Uri.joinPath(context.extensionUri, "icons", "bun.png");
    const terminal = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        shellPath: path.join(windir, "System32", "cmd.exe"),
        cwd,
        iconPath,
    });
    terminal.show();
    terminal.sendText("opencode");
    return terminal;
}
async function getExplorerSelectionUris() {
    const previous = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText("");
    try {
        await vscode.commands.executeCommand("copyFilePath");
        let raw = "";
        for (let i = 0; i < 10 && !raw; i++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            raw = (await vscode.env.clipboard.readText()).trim();
        }
        return raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((p) => vscode.Uri.file(p));
    }
    finally {
        await vscode.env.clipboard.writeText(previous);
    }
}
async function isDirectory(uri) {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return (stat.type & vscode.FileType.Directory) !== 0;
    }
    catch {
        return false;
    }
}
async function sendExplorerSelection(uris) {
    const refs = [];
    for (const uri of uris) {
        const file = toRelativePath(uri);
        const isDir = await isDirectory(uri);
        refs.push(isDir ? `@${file}/` : `@${file}`);
    }
    const reference = refs.join(" ");
    sendToTerminal(reference, `OpenCode reference sent: ${reference}`);
}
function sendToTerminal(text, message) {
    const terminal = findOpenCodeTerminal();
    if (!terminal) {
        vscode.window.showWarningMessage("OpenCode terminal is not active.");
        return;
    }
    terminal.show();
    terminal.sendText(`\x1b[200~${text}\n\x1b[201~`, false);
    vscode.window.setStatusBarMessage(message, 3000);
}
function activate(context) {
    const send = vscode.commands.registerCommand("extension.send", () => {
        if (!findOpenCodeTerminal()) {
            createOpenCodeTerminal(context);
            vscode.window.setStatusBarMessage("OpenCode terminal opened.", 3000);
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            findOpenCodeTerminal()?.show();
            return;
        }
        const document = editor.document;
        if (document.uri.scheme === "untitled") {
            vscode.window.showWarningMessage("Cannot reference an unsaved file. Save it first.");
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            findOpenCodeTerminal()?.show();
            return;
        }
        vscode.commands.executeCommand("workbench.action.files.saveAll");
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const file = toRelativePath(document.uri);
        const range = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
        const reference = `@${file}#${range}`;
        sendToTerminal(reference, `OpenCode reference sent: ${reference}`);
    });
    const sendSelected = vscode.commands.registerCommand("extension.sendSelected", async () => {
        if (!findOpenCodeTerminal()) {
            createOpenCodeTerminal(context);
            vscode.window.setStatusBarMessage("OpenCode terminal opened.", 3000);
            return;
        }
        const uris = await getExplorerSelectionUris();
        if (!uris.length) {
            findOpenCodeTerminal()?.show();
            return;
        }
        await sendExplorerSelection(uris);
    });
    const focus = vscode.commands.registerCommand("extension.focus", () => {
        const existing = findOpenCodeTerminal();
        if (existing) {
            existing.show();
            return;
        }
        createOpenCodeTerminal(context);
        vscode.window.setStatusBarMessage("OpenCode terminal opened.", 3000);
    });
    context.subscriptions.push(send, sendSelected, focus);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map