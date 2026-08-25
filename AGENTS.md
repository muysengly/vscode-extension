# OpenCode Extension — `ctrl+'` Usage

Press **Ctrl+'** to send file/line references from VS Code to the OpenCode terminal (pwsh).

- **Editor** — cursor on a line, no selection → sends `@file#L<line>` (e.g. `@src/app.ts#L42\n`)
- **Editor** — text selected (single line) → sends `@file#L<line>` (e.g. `@src/app.ts#L15\n`)
- **Editor** — text selected (multi-line) → sends `@file#L<start>-<end>` (e.g. `@src/app.ts#L10-L25\n`)
- **Editor** — multiple cursors/selections → sends all refs joined by space (e.g. `@src/a.ts#L5 @src/b.ts#L12\n`)
- **Explorer** — file(s) selected → sends `@<relative-path>` (e.g. `@src/utils.ts\n`)
- **Explorer** — folder selected → sends `@<relative-path>/` (e.g. `@src/components/\n`)
- **Explorer** — right-click context menu (file or folder) → most reliable path; URIs come
  straight from the menu args, no clipboard round-trip. Use this for folders.
- **Explorer** — Ctrl+' keybinding → same refs, but resolves selection via a clipboard probe
  (`copyFilePath`); if the probe misses (e.g. folder not copied), it reports "no file selected"
  instead of sending a wrong ref.
- **Explorer** — blank space (nothing selected) → focuses terminal only
- **Anywhere else** (sidebar, no focus, etc.) → focuses/opens OpenCode terminal

# Conditions (must always hold):

- Save ALL open files before sending a reference.
- Never let the Python extension inject venv activation into the OpenCode terminal —
  not on VS Code start, not on window reload, not on new terminals
  (`python.terminal.activateEnvironment` stays disabled).
- Always write the reference to the clipboard BEFORE pasting it into the OpenCode terminal
  (the user's clipboard keeps the last-sent ref as source of truth).
- Indent the reference when it is sent into the terminal.
- Prefer the Explorer right-click context menu ("Send to OpenCode") for file/folder refs —
  most reliable path; Ctrl+' keybinding is the fallback.
- If you are not sure what to do (ambiguous request, missing info, multiple valid approaches),
  ask me before acting — do not guess.
