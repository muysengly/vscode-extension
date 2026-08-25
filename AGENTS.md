# OpenCode Extension — How It Works

Press **Ctrl+'** to send file/line references from VS Code to the OpenCode terminal (pwsh).

## Terminal lifecycle

- On activation: any stale OpenCode terminal is disposed and a fresh one is created
  (pwsh 7 at `C:\Program Files\PowerShell\7\pwsh.exe`, cwd = first workspace folder),
  which auto-runs `opencode`.
- `extension.startOpenCode` does a full restart the same way (dispose + recreate).
- `opencode.venvPath` setting (optional): prepends `<venv>/Scripts` (win32) or
  `<venv>/bin` to the terminal's PATH env.
- The OpenCode terminal is created `hideFromUser: true` and shown immediately —
  the Python extension skips hidden terminals, so it never injects venv activation
  into THIS terminal; all other terminals keep normal auto-activation.
  Do NOT write `python.terminal.activateEnvironment` into workspace settings —
  that would kill auto-activation for every terminal in the project.
- **Boot gate:** if a command had to CREATE the terminal (`ensureTerminal` returned
  false), the reference is NOT sent — `opencode` was just booted. Press Ctrl+' again
  to send. Only an already-running terminal accepts a reference.

## Ctrl+' routing (keybindings live in package.json)

**Editor focused** (`extension.send` / `extension.focus`):

- Cursor on a line, nothing selected → `@file#L<line>` (a lone cursor counts)
- One line selected → `@file#L<line>`
- Multi-line selection → `@file#L<start>-<end>`; a selection ending at column 0
  really ends on the previous line
- Multiple cursors/selections → one ref per cursor, joined by spaces, deduped
  (all within the same file)
- Unsaved (untitled) file → warning "Cannot reference an unsaved file", nothing sent
- No visible editor → raises the terminal only
- Paths are workspace-relative with forward slashes

**Explorer focused** (`extension.sendSelected`):

- Right-click context menu → most reliable path; the right-clicked URI plus all
  selected URIs arrive straight from the menu args (an unselected right-clicked row
  is prepended). Use this for folders.
- Ctrl+' keybinding → resolves the selection via a clipboard probe: write a sentinel
  to the clipboard, run built-in `copyFilePath`, poll up to ~500ms, then restore the
  user's clipboard either way. MUST run while the explorer still has focus, i.e.
  BEFORE the terminal is shown. Workspace-root rows copied by a miss are dropped.
- File(s) selected → `@<relative-path>` · Folder(s) → `@<relative-path>/`
  (folder vs file decided by `fs.stat`)
- Blank space (nothing selected) → `extension.explorerBlank` — routed by its own
  keybinding because blankness is NOT detectable inside a command; focuses terminal
  + status "OpenCode: no file selected."

**Anywhere else** (`extension.focus`): a saved editor visible → send its ref;
otherwise → focus/open the terminal.

## Send mechanics

- ALL open files are saved first (`workbench.action.files.saveAll`).
- The ref string is written to the clipboard FIRST, then pasted into the terminal via
  bracketed paste (`ESC[200~ <ref>\n ESC[201~`, no echo) so pwsh treats it as one
  literal block; the embedded `\n` submits it.
- Status bar confirms: "OpenCode reference sent." / "OpenCode terminal opened."

# Conditions (must always hold):

- Save ALL open files before sending a reference.
- Never let the Python extension inject venv activation into the OpenCode terminal —
  achieved by creating that terminal `hideFromUser: true` (Python skips hidden
  terminals). Do NOT disable `python.terminal.activateEnvironment` in workspace
  settings — other terminals must keep auto-activation.
- Always write the reference to the clipboard BEFORE pasting it into the OpenCode
  terminal (the user's clipboard keeps the last-sent ref as source of truth).
- Paste references as one literal bracketed-paste block (`ESC[200~…ESC[201~`),
  never typed keystroke-by-keystroke.
- Never send a reference into a freshly created terminal — let `opencode` boot first;
  the next Ctrl+' sends it.
- Prefer the Explorer right-click context menu ("Send to OpenCode") for file/folder
  refs — most reliable path; Ctrl+' keybinding is the fallback.
- If you are not sure what to do (ambiguous request, missing info, multiple valid
  approaches), ask me before acting — do not guess.
