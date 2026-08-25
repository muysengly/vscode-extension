# OpenCode Extension — `ctrl+'` Usage

Press **Ctrl+'** to send file/line references from VS Code to the OpenCode terminal (pwsh).

- **Editor** — cursor on a line, no selection → sends `@file#L<line>` (e.g. `@src/app.ts#L42\n`)
- **Editor** — text selected (single line) → sends `@file#L<line>` (e.g. `@src/app.ts#L15\n`)
- **Editor** — text selected (multi-line) → sends `@file#L<start>-<end>` (e.g. `@src/app.ts#L10-L25\n`)
- **Editor** — multiple cursors/selections → sends all refs joined by space (e.g. `@src/a.ts#L5 @src/b.ts#L12\n`)
- **Explorer** — file(s) selected → sends `@<relative-path>` (e.g. `@src/utils.ts\n`)
- **Explorer** — folder selected → sends `@<relative-path>/` (e.g. `@src/components/\n`)
- **Explorer** — blank space (nothing selected) → focuses terminal only
- **Anywhere else** (sidebar, no focus, etc.) → focuses/opens OpenCode terminal

Conditions:

- save all file before sending references
- when start vscode don't activate venv of python
- when reload vscode dont activate venv of python
- save to clipboard before past to opencode terminal
- add indent when send
