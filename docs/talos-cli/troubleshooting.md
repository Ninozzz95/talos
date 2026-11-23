# Troubleshooting

Start with the local doctor. TALOS CLI sends no telemetry while doing this.

<!-- test:smoke -->
```powershell
talos doctor --json
```

Inspect local logs:

<!-- test:smoke -->
```powershell
talos logs --tail 100
```

Create a redacted diagnostic bundle for a bug report. Prompt/file contents are not included by default:

<!-- test:smoke -->
```powershell
talos diagnostic bundle --out .\talos-diagnostic.zip
```

Check for an update without installing it:

<!-- test:smoke -->
```powershell
talos update --check
```

With an npm install this asks the npm registry and prints the command to run (`npm i -g talos-code@latest`); it
never changes anything by itself. If `talos` is not found after installing, check that it was installed with `-g` and
that npm's global folder (`npm prefix -g`) is on `PATH`; `npm i talos-code` without `-g` installs no command.

Check the preview channel explicitly:

<!-- test:smoke -->
```powershell
talos update --check --channel preview
```

List saved sessions before resuming one:

<!-- test:smoke -->
```powershell
talos session list --json
```

Export a session without executing anything from it:

<!-- test:smoke -->
```powershell
talos session export 123e4567-e89b-12d3-a456-426614174000 --format json --out .\session.json
```

## Importing a session archive

`talos session import <file>` validates the archive schema and a filename-safe session id, rejects oversized archives and removes pending approval requests. Imported archives are recorded with TALOS CLI provenance and are deliberately inert (`runnable: false`): importing data never executes commands or permissions from another machine.

## Terminal display and keyboard behavior

If animation is undesirable or a terminal/multiplexer renders motion poorly, set `TALOS_REDUCED_MOTION=1`. TALOS keeps semantic status text but disables the boot/spinner animation. `--no-color` removes color styling. `TERM=dumb` selects the Unicode fallback path.

`Shift+Enter` depends on the terminal reporting modified Enter distinctly. Use `Ctrl+J` as the portable newline fallback. `Ctrl+L` (or `/redraw`) repaints the TUI; `Alt+P` opens the model picker.

The interactive TUI is used only when both stdin and stdout are TTYs. Redirected/piped input or output runs headlessly, so JSON, JSONL and CI output are not mixed with boot frames, spinners or overlays.
