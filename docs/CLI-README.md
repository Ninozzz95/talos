# TALOS CLI

TALOS CLI is the terminal surface of the TALOS coding agent. It runs independently of TALOS Desktop while reusing the TALOS agent kernel, provider adapters, context engine and agentic services from the same repository.

## Start

After the Windows installer, open a terminal in a project and run:

<!-- test:smoke -->
```powershell
talos
```

For a one-shot task:

<!-- test:smoke -->
```powershell
talos -p "inspect this repository and explain the failing tests"
```

For machine-readable output:

<!-- test:smoke -->
```powershell
talos -p "summarize the changes" --json
```

The portable Windows package also contains `Start TALOS CLI.cmd`; double-click it to open TALOS CLI without typing a command.

See `docs/talos-cli/` for installation, providers, permissions, CI, extensions and troubleshooting.

## Interactive TUI

The interactive terminal UI uses a single focus router for the composer, command menu, model/provider/session pickers, approvals and help. `Ctrl+L` opens the model picker, `Alt+P` opens provider setup/status, `Ctrl+T` toggles reasoning, `Ctrl+O` expands tool detail, `Ctrl+R` reverse-searches history and `Ctrl+G` opens the configured external editor. Use `PageUp`/`PageDown` for transcript navigation and `?` on an empty composer for the generated keyboard reference.

`/model`, `/resume` and `/fork` open their pickers when no id is supplied; `/model provider:model` selects the model for subsequent runs through the same `project-user` persistence path as the picker. `/redraw` is the explicit redraw fallback. Service commands such as `/mcp`, `/hooks`, `/plugins`, `/doctor`, `/memory`, `/notes`, `/tasks`, `/library`, `/research`, `/automations` and `/forge` continue to execute the CLI service layer without leaving the TUI.

`Shift+Enter` inserts a newline when the terminal reports that modified key distinctly; `Ctrl+J` is the portable fallback. Set `TALOS_REDUCED_MOTION=1` to keep status text while disabling boot/spinner animation. `--no-color` disables styling. Non-TTY, JSON/JSONL and piped execution never load the interactive surface.

Code fences for JSON, JavaScript/TypeScript and shell families use terminal syntax highlighting with a monochrome fallback.

## Generated command reference

`docs/talos-cli/command-reference.md` is generated from the same slash-command and built-in keybinding catalogs used by the TUI. Interactive `?`/`/help` uses the effective keymap after user or project-user overrides, so the screen reflects remapped shortcuts while the generated reference records built-in defaults.

Regenerate the reference after changing commands or built-in bindings:

```powershell
node --experimental-strip-types cli/scripts/generate-command-reference.ts
```
