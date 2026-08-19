"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const pty = require("node-pty");
const OPENCODE_VIEW = "opencode.view";
function toRelativePath(uri) {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}
class OpenCodePanelProvider {
    constructor(context) {
        this.context = context;
        this.queue = [];
        this.outputBuffer = [];
        this.ready = false;
        this.webviewReady = false;
        this.output = vscode.window.createOutputChannel("OpenCode");
        this.loadDelayMs =
            Math.max(0, vscode.workspace
                .getConfiguration("opencode")
                .get("loadDelaySeconds", 3)) * 1000;
    }
    log(message) {
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
    notify(text, color) {
        this.log(text);
        this.post({ type: "status", text, color });
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        this.webviewReady = false;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, "node_modules"),
                vscode.Uri.joinPath(this.context.extensionUri, "media")
            ]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        this.log("view resolved");
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case "ready":
                    this.log("webview ready");
                    this.webviewReady = true;
                    this.flushOutput();
                    break;
                case "input":
                    this.terminal?.write(message.data);
                    break;
                case "resize":
                    this.terminal?.resize(message.cols, message.rows);
                    break;
                case "error":
                    this.log(`WEBVIEW ERROR: ${message.message}`);
                    vscode.window.showErrorMessage(`OpenCode view error: ${message.message}`);
                    break;
            }
        });
        this.start();
    }
    start() {
        if (this.terminal) {
            return;
        }
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const env = {
            ...process.env,
            TERM: "xterm-256color"
        };
        const file = process.platform === "win32" && process.env.ComSpec
            ? process.env.ComSpec
            : "opencode";
        const args = process.platform === "win32" ? ["/c", "opencode"] : [];
        this.log(`launching opencode: ${file} ${args.join(" ")} (cwd=${cwd})`);
        this.notify(`launching opencode in ${cwd}\u2026`);
        let term;
        try {
            term = pty.spawn(file, args, {
                name: "xterm-256color",
                cols: 80,
                rows: 24,
                cwd,
                env
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log(`spawn failed: ${msg}`);
            vscode.window.showErrorMessage(`Failed to launch OpenCode: ${msg}`);
            return;
        }
        this.terminal = term;
        this.ready = false;
        this.log("opencode spawned");
        this.notify("opencode launched\u2026");
        term.onData((data) => {
            this.emitData(data);
        });
        term.onExit(({ exitCode }) => {
            this.terminal = undefined;
            this.ready = false;
            this.log(`opencode exited (code ${exitCode})`);
            this.post({ type: "exit", exitCode });
        });
        setTimeout(() => {
            this.log(`load delay (${this.loadDelayMs}ms) elapsed, flushing ${this.queue.length} queued reference(s)`);
            this.ready = true;
            this.flushReferences();
        }, this.loadDelayMs);
    }
    sendReference(text) {
        if (!this.terminal) {
            this.start();
        }
        const input = `${text}\r\r`;
        if (this.ready && this.terminal) {
            this.log(`sent reference: ${text}`);
            this.notify(`\u2192 sent: ${text}`, "#9cdcfe");
            this.terminal.write(input);
        }
        else {
            this.queue.push(input);
            this.log(`queued reference (opencode not ready): ${text}`);
            this.notify(`\u231b queued until opencode is ready: ${text}`, "#e2c08d");
        }
    }
    emitData(data) {
        if (this.webviewReady) {
            this.post({ type: "data", data });
        }
        else {
            this.outputBuffer.push(data);
            if (this.outputBuffer.length > 500) {
                this.outputBuffer.shift();
            }
        }
    }
    flushOutput() {
        if (!this.webviewReady) {
            return;
        }
        while (this.outputBuffer.length > 0) {
            this.post({ type: "data", data: this.outputBuffer.shift() });
        }
    }
    flushReferences() {
        while (this.queue.length > 0 && this.terminal) {
            const input = this.queue.shift();
            this.log(`flushing queued reference: ${input.replace(/\r/g, "")}`);
            this.notify(`\u2192 sent: ${input.replace(/\r/g, "")}`, "#9cdcfe");
            this.terminal.write(input);
        }
    }
    post(message) {
        void this.view?.webview.postMessage(message);
    }
    getHtml(webview) {
        const xtermJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "xterm", "lib", "xterm.js"));
        const xtermCss = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "xterm", "css", "xterm.css"));
        const fitJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "addon-fit", "lib", "addon-fit.js"));
        const mainJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"));
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource};">
  <link rel="stylesheet" href="${xtermCss}">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
    body { display: flex; flex-direction: column; background: #1e1e1e; }
    #status {
      flex: 0 0 auto;
      padding: 4px 8px;
      font-family: Consolas, monospace;
      font-size: 12px;
      color: #9cdcfe;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      white-space: pre-wrap;
      word-break: break-all;
    }
    #terminal { flex: 1 1 auto; min-height: 0; }
  </style>
</head>
<body>
  <div id="status">OpenCode view: connecting\u2026 (if this stays, report the text)</div>
  <div id="terminal"></div>
  <script src="${xtermJs}"></script>
  <script src="${fitJs}"></script>
  <script src="${mainJs}"></script>
</body>
</html>`;
    }
}
OpenCodePanelProvider.viewType = OPENCODE_VIEW;
function activate(context) {
    const provider = new OpenCodePanelProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(OpenCodePanelProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } }));
    async function openPanel() {
        await vscode.commands.executeCommand(`${OPENCODE_VIEW}.focus`);
    }
    const sendFromExplorer = vscode.commands.registerCommand("extension.sendFromExplorer", async (resource) => {
        const uris = [];
        if (resource instanceof vscode.Uri) {
            uris.push(resource);
        }
        else if (resource) {
            uris.push(resource.uri);
        }
        else {
            const original = await vscode.env.clipboard.readText();
            try {
                await vscode.commands.executeCommand("copyFilePath");
            }
            catch (error) {
                vscode.window.showWarningMessage("No file or folder is selected in the Explorer.");
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
        const references = uris
            .map((uri) => `@${toRelativePath(uri)}`)
            .join(" ");
        await openPanel();
        provider.sendReference(references);
    });
    const send = vscode.commands.registerCommand("extension.send", async () => {
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
        const range = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
        const reference = `@${file}#${range}`;
        await openPanel();
        provider.sendReference(reference);
    });
    context.subscriptions.push(sendFromExplorer, send);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map