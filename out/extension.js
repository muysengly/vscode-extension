"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require("path");
const vscode = require("vscode");
// ============================================================================
// Ctrl+O BEHAVIOR MAP
//
// Editor focused (extension.send):
//   cursor on a line, NO chars selected → @file#L<line>   <-- cursor alone counts
//   text selected                       → @file#L<start>-<end>
//
// Explorer focused:
//   file(s)/folder(s) selected          → @file / @folder/   (sendSelected)
//   blank space, nothing selected       → focus terminal + status message
//                                         (explorerBlank — routed by keybinding,
//                                          NOT detectable inside a command)
//
// Anywhere else (extension.focus):
//                                       → focus / open the terminal
// ============================================================================
// ----------------------------------------------------------------------------
// BLOCK 1 — Terminal management
// ----------------------------------------------------------------------------
const TERMINAL_NAME = "OpenCode";
function findTerminal() {
    return vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
}
function createTerminal(context) {
    const terminal = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        shellPath: path.join(process.env.windir ?? "C:\\Windows", "System32", "cmd.exe"),
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
        iconPath: vscode.Uri.joinPath(context.extensionUri, "icons", "bun.png"),
    });
    terminal.show();
    terminal.sendText("opencode"); // launch opencode inside it
    return terminal;
}
// Returns true when the terminal already existed.
// First-ever Ctrl+O only opens the terminal and sends nothing.
function ensureTerminal(context) {
    if (findTerminal()) {
        return true;
    }
    createTerminal(context);
    setStatus("OpenCode terminal opened.");
    return false;
}
// ----------------------------------------------------------------------------
// BLOCK 2 — Small helpers
// ----------------------------------------------------------------------------
function setStatus(message) {
    vscode.window.setStatusBarMessage(message, 3000);
}
// "src\folder\file.ts" → "src/folder/file.ts" (relative to workspace root)
function toRelativePath(uri) {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}
// ----------------------------------------------------------------------------
// BLOCK 3 — Editor reference (cursor line OR selection)
// ----------------------------------------------------------------------------
function getEditorReference(editor) {
    const file = toRelativePath(editor.document.uri);
    const selection = editor.selection;
    const startLine = selection.start.line + 1; // VSCode lines are 0-based
    let endLine = selection.end.line + 1;
    // Nothing selected → cursor only → ALWAYS the cursor's own line.
    // e.g. cursor sitting on line 12 → "@src/app.ts#L12"
    if (selection.isEmpty) {
        return `@${file}#L${startLine}`;
    }
    // Multi-line selection ending at column 0 really ends on the previous line.
    if (selection.end.character === 0 && endLine > startLine) {
        endLine -= 1;
    }
    // One line selected  → "@src/app.ts#L5"
    // Several lines      → "@src/app.ts#L5-L9"
    return startLine === endLine
        ? `@${file}#L${startLine}`
        : `@${file}#L${startLine}-${endLine}`;
}
function sendEditorReference() {
    const editor = vscode.window.activeTextEditor;
    // No visible editor → just raise the terminal.
    if (!editor) {
        findTerminal()?.show();
        return;
    }
    // Unsaved files have no path to reference.
    if (editor.document.uri.scheme === "untitled") {
        vscode.window.showWarningMessage("Cannot reference an unsaved file. Save it first.");
        return;
    }
    void vscode.commands.executeCommand("workbench.action.files.saveAll");
    const reference = getEditorReference(editor);
    sendToTerminal(reference);
}
// ----------------------------------------------------------------------------
// BLOCK 4 — Explorer selection (clipboard round-trip)
// ----------------------------------------------------------------------------
const CLIPBOARD_SENTINEL = "__opencode_no_selection__";
function normalizeFsPath(fsPath) {
    const trimmed = fsPath.replace(/[\\/]+$/, "");
    return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}
// How this works:
// 1. Save the user's clipboard, write a sentinel marker instead.
// 2. Run VSCode's built-in "copyFilePath" on the explorer selection.
// 3. Poll the clipboard briefly. Sentinel untouched → nothing was selected.
// 4. Restore the user's clipboard either way.
async function getExplorerSelectionUris() {
    const previous = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(CLIPBOARD_SENTINEL);
    try {
        await vscode.commands.executeCommand("copyFilePath");
        // Wait up to ~500ms for copyFilePath to overwrite the sentinel.
        let raw = "";
        for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            raw = (await vscode.env.clipboard.readText()).trim();
            if (raw && raw !== CLIPBOARD_SENTINEL)
                break;
        }
        // Sentinel survived → explorer had no selection (blank space).
        if (!raw || raw === CLIPBOARD_SENTINEL) {
            return [];
        }
        // Drop workspace-root rows (blank-space copies yield the root folder).
        const rootPaths = new Set((vscode.workspace.workspaceFolders ?? []).map((folder) => normalizeFsPath(folder.uri.fsPath)));
        return raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((p) => vscode.Uri.file(p))
            .filter((uri) => !rootPaths.has(normalizeFsPath(uri.fsPath)));
    }
    finally {
        await vscode.env.clipboard.writeText(previous); // restore clipboard
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
// File → "@src/app.ts"   Folder → "@src/docs/"
async function sendExplorerSelection(uris) {
    const refs = [];
    for (const uri of uris) {
        const file = toRelativePath(uri);
        refs.push((await isDirectory(uri)) ? `@${file}/` : `@${file}`);
    }
    sendToTerminal(refs.join(" "));
}
// ----------------------------------------------------------------------------
// BLOCK 5 — Send to terminal
// ----------------------------------------------------------------------------
// Bracketed-paste codes (\x1b[200~ ... \x1b[201~) insert the text literally
// instead of letting the shell execute each line as it arrives.
function sendToTerminal(text) {
    const terminal = findTerminal();
    if (!terminal) {
        vscode.window.showWarningMessage("OpenCode terminal is not active.");
        return;
    }
    terminal.show();
    terminal.sendText(`\x1b[200~${text}\n\x1b[201~`, false);
    setStatus(`OpenCode reference sent: ${text}`);
}
// ----------------------------------------------------------------------------
// BLOCK 6 — Commands (keybindings live in package.json)
// ----------------------------------------------------------------------------
function activate(context) {
    context.subscriptions.push(
    // Ctrl+O while typing in an editor.
    vscode.commands.registerCommand("extension.send", () => {
        if (!ensureTerminal(context))
            return;
        sendEditorReference();
    }), 
    // Ctrl+O while the Explorer sidebar has focus.
    vscode.commands.registerCommand("extension.sendSelected", async () => {
        if (!ensureTerminal(context))
            return;
        const uris = await getExplorerSelectionUris();
        // Blank space in explorer → focus terminal only, no reference sent.
        if (!uris.length) {
            findTerminal()?.show();
            setStatus("OpenCode: no file selected, sent cursor only.");
            return;
        }
        await sendExplorerSelection(uris);
    }), 
    // Ctrl+O in Explorer with nothing selected (blank space click clears
    // both selection and focus → listHasSelectionOrFocus is false).
    // Keybinding routes here BEFORE sendSelected can even try the clipboard,
    // so no stale/fallback file can ever be sent.
    vscode.commands.registerCommand("extension.explorerBlank", () => {
        const terminal = findTerminal() ?? createTerminal(context);
        terminal.show();
        setStatus("OpenCode: no file selected, sent cursor only.");
    }), 
    // Ctrl+O anywhere else → just focus (or open) the terminal.
    vscode.commands.registerCommand("extension.focus", () => {
        const terminal = findTerminal() ?? createTerminal(context);
        terminal.show();
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map