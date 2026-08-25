import * as path from "path";
import * as vscode from "vscode";

// ============================================================================
// Ctrl+' BEHAVIOR MAP
//
// Editor focused (extension.send):
//   cursor on a line, NO chars selected → @file#L<line>   <-- cursor alone counts
//   text selected                       → @file#L<start>-<end>
//   multiple cursors/selections         → one ref each, joined with spaces
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

function getVenvPath(): string | undefined {
  const config = vscode.workspace.getConfiguration("opencode");
  const configured = config.get<string>("venvPath", "").trim();
  if (configured) return configured;
  return undefined;
}

function getEnvWithVenv(): Record<string, string> {
  const venv = getVenvPath();
  if (!venv) return {};

  const scriptsDir =
    process.platform === "win32"
      ? path.join(venv, "Scripts")
      : path.join(venv, "bin");

  return { PATH: `${scriptsDir};${process.env.PATH ?? ""}` };
}

let opencodeStarted = false;

function findTerminal(): vscode.Terminal | undefined {
  return vscode.window.terminals.find(
    (t) => t.name === TERMINAL_NAME || t.name.startsWith(TERMINAL_NAME)
  );
}

function createTerminal(
  context: vscode.ExtensionContext,
  forceNew = false,
  resume = false
): vscode.Terminal {
  if (!forceNew) {
    const existing = findTerminal();
    if (existing) {
      existing.show();
      opencodeStarted = true;
      return existing;
    }
  }

  const terminal = vscode.window.createTerminal({
    name: TERMINAL_NAME,
    shellPath: path.join(
      "C:\\Program Files",
      "PowerShell",
      "7",
      "pwsh.exe"
    ),
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
    iconPath: vscode.Uri.joinPath(context.extensionUri, "icons", "bun.png"),
    env: getEnvWithVenv(),
  });

  terminal.show();
  terminal.sendText(resume ? "opencode --resume" : "opencode");
  opencodeStarted = true;
  return terminal;
}

function ensureTerminal(context: vscode.ExtensionContext): boolean {
  const existing = findTerminal();
  if (existing) {
    existing.show();
    return true;
  }
  createTerminal(context);
  setStatus("OpenCode terminal opened.");
  return false;
}

// ----------------------------------------------------------------------------
// BLOCK 2 — Small helpers
// ----------------------------------------------------------------------------

function setStatus(message: string): void {
  vscode.window.setStatusBarMessage(message, 3000);
}

// "src\folder\file.ts" → "src/folder/file.ts" (relative to workspace root)
function toRelativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}

// ----------------------------------------------------------------------------
// BLOCK 3 — Editor references (one per cursor / selection)
// ----------------------------------------------------------------------------

// Builds one "@file#L..." reference for EVERY cursor/selection.
// Multiple cursors on the same line collapse into a single ref (deduped).
function getEditorReferences(editor: vscode.TextEditor): string[] {
  const file = toRelativePath(editor.document.uri);
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const selection of editor.selections) {
    const startLine = selection.start.line + 1; // VSCode lines are 0-based
    let endLine = selection.end.line + 1;

    // Nothing selected → cursor only → ALWAYS the cursor's own line.
    // e.g. cursor sitting on line 12 → "@src/app.ts#L12"
    let reference: string;
    if (selection.isEmpty) {
      reference = `@${file}#L${startLine}`;
    } else {
      // Multi-line selection ending at column 0 really ends on the previous line.
      if (selection.end.character === 0 && endLine > startLine) {
        endLine -= 1;
      }

      // One line selected  → "@src/app.ts#L5"
      // Several lines      → "@src/app.ts#L5-L9"
      reference =
        startLine === endLine
          ? `@${file}#L${startLine}`
          : `@${file}#L${startLine}-${endLine}`;
    }

    if (!seen.has(reference)) {
      seen.add(reference);
      refs.push(reference);
    }
  }

  return refs;
}

function sendEditorReference(): void {
  const editor = vscode.window.activeTextEditor;

  // No visible editor → just raise the terminal.
  if (!editor) {
    findTerminal()?.show();
    return;
  }

  // Unsaved files have no path to reference.
  if (editor.document.uri.scheme === "untitled") {
    vscode.window.showWarningMessage(
      "Cannot reference an unsaved file. Save it first."
    );
    return;
  }

  void vscode.commands.executeCommand("workbench.action.files.saveAll");

  const references = getEditorReferences(editor);
  copyToClipboardAndFocus(references.join(" "));
}

// ----------------------------------------------------------------------------
// BLOCK 4 — Explorer selection (clipboard round-trip)
// ----------------------------------------------------------------------------

const CLIPBOARD_SENTINEL = "__opencode_no_selection__";

function normalizeFsPath(fsPath: string): string {
  const trimmed = fsPath.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

// How this works:
// 1. Save the user's clipboard, write a sentinel marker instead.
// 2. Run VSCode's built-in "copyFilePath" on the explorer selection.
// 3. Poll the clipboard briefly. Sentinel untouched → nothing was selected.
// 4. Restore the user's clipboard either way.

async function getExplorerSelectionUris(): Promise<vscode.Uri[]> {
  const previous = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(CLIPBOARD_SENTINEL);

  try {
    await vscode.commands.executeCommand("copyFilePath");

    // Wait up to ~500ms for copyFilePath to overwrite the sentinel.
    let raw = "";
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      raw = (await vscode.env.clipboard.readText()).trim();
      if (raw && raw !== CLIPBOARD_SENTINEL) break;
    }

    // Sentinel survived → explorer had no selection (blank space).
    if (!raw || raw === CLIPBOARD_SENTINEL) {
      return [];
    }

    // Drop workspace-root rows (blank-space copies yield the root folder).
    const rootPaths = new Set(
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        normalizeFsPath(folder.uri.fsPath)
      )
    );

    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((p) => vscode.Uri.file(p))
      .filter((uri) => !rootPaths.has(normalizeFsPath(uri.fsPath)));
  } finally {
    await vscode.env.clipboard.writeText(previous); // restore clipboard
  }
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

// File → "@src/app.ts"   Folder → "@src/docs/"
async function sendExplorerSelection(uris: vscode.Uri[]): Promise<void> {
  const refs: string[] = [];

  for (const uri of uris) {
    const file = toRelativePath(uri);
    refs.push((await isDirectory(uri)) ? `@${file}/` : `@${file}`);
  }

  copyToClipboardAndFocus(refs.join(" "));
}

// ----------------------------------------------------------------------------
// BLOCK 5 — Copy reference to clipboard, then send to OpenCode terminal
// ----------------------------------------------------------------------------

function copyToClipboardAndFocus(text: string): void {
  void vscode.env.clipboard.writeText(text);
  const terminal = findTerminal();
  if (terminal) {
    terminal.show();
    terminal.sendText(`\x1b[200~${text}\n\x1b[201~`);
    setStatus(`OpenCode reference sent.`);
  }
}

// ----------------------------------------------------------------------------
// BLOCK 6 — Commands (keybindings live in package.json)
// ----------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  // Prevent the Python extension from injecting venv activation into our terminal.
  const pythonConfig = vscode.workspace.getConfiguration("python.terminal");
  if (pythonConfig.get<boolean>("activateEnvironment") !== false) {
    pythonConfig.update(
      "activateEnvironment",
      false,
      vscode.ConfigurationTarget.Workspace
    );
  }

  const existing = findTerminal();
  if (existing) {
    existing.dispose();
  }
  opencodeStarted = false;
  createTerminal(context, true, false);
  setStatus("OpenCode: started.");

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.startOpenCode", () => {
      const existing = findTerminal();
      if (existing) {
        existing.dispose();
      }
      createTerminal(context, true, false);
      setStatus("OpenCode: started.");
    }),

    // Ctrl+' while typing in an editor.
    vscode.commands.registerCommand("extension.send", () => {
      if (!ensureTerminal(context)) return;
      sendEditorReference();
    }),

    // Ctrl+' while the Explorer sidebar has focus.
    vscode.commands.registerCommand("extension.sendSelected", async () => {
      if (!ensureTerminal(context)) return;

      const uris = await getExplorerSelectionUris();

      // Blank space in explorer → focus terminal only, no reference sent.
      if (!uris.length) {
        findTerminal()?.show();
        setStatus("OpenCode: no file selected.");
        return;
      }

      await sendExplorerSelection(uris);
    }),

    vscode.commands.registerCommand("extension.explorerBlank", () => {
      const terminal = findTerminal() ?? createTerminal(context);
      terminal.show();
      setStatus("OpenCode: no file selected.");
    }),

    // Ctrl+' anywhere else → send editor reference if available, or focus terminal.
    vscode.commands.registerCommand("extension.focus", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.scheme !== "untitled") {
        if (!ensureTerminal(context)) return;
        sendEditorReference();
      } else {
        const terminal = findTerminal() ?? createTerminal(context);
        terminal.show();
      }
    })
  );
}

export function deactivate() { }
