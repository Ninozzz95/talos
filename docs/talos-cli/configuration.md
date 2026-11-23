# Configuration

TALOS CLI merges configuration in this order: built-in defaults, user configuration, project-shared configuration, per-user project overrides, then explicit command-line flags. Secrets are not stored in these JSON files.

Show the effective configuration:

<!-- test:smoke -->
```powershell
talos config list --json
```

Show where effective values came from:

<!-- test:smoke -->
```powershell
talos config origins --json
```

Set the default model for the current user:

<!-- test:smoke -->
```powershell
talos config set model "ollama:qwen3-coder" --scope user
```

Set a project-shared value:

<!-- test:smoke -->
```powershell
talos config set ui.theme "mono" --scope project
```

Remove a project-user override:

<!-- test:smoke -->
```powershell
talos config unset model --scope project-user
```

Command-line flags win for that invocation only:

<!-- test:smoke -->
```powershell
talos -p "review the current diff" --model ollama:qwen3-coder --project .
```
