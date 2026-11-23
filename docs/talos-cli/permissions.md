# Permissions and trust

TALOS CLI uses explicit permission policy modes and separate trust stores for executable project integrations. Project files cannot silently grant themselves trust.

The supported permission modes are `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, and `bypassPermissions`.

Inspect the canonical project identity and its executable-resource snapshot:

<!-- test:smoke -->
```powershell
talos --json project status
```

Trust the exact snapshot after review, or revoke it later:

<!-- test:smoke -->
```powershell
talos project trust
talos project revoke
```

Adding, removing, or changing project config, instructions, commands, hooks,
MCP configuration, or plugin manifests invalidates the snapshot. Review the
new state and run `talos project trust` again. Projects without any such
resources continue without a trust record.

Explore a repository without allowing edits:

<!-- test:smoke -->
```powershell
talos -p "inspect the architecture and propose a plan" --permission-mode plan
```

Run non-interactively where an unresolved interactive approval must become a denial instead of blocking:

<!-- test:smoke -->
```powershell
talos -p "run the checks that are already allowed" --permission-mode dontAsk --json
```

Inspect configured MCP servers and their trust state:

<!-- test:smoke -->
```powershell
talos mcp list --json
```

Trust a reviewed MCP server by id:

<!-- test:smoke -->
```powershell
talos mcp trust local-tools
```

Inspect project hooks:

<!-- test:smoke -->
```powershell
talos hook list --json
```

`bypassPermissions` is not a sandbox. Use it only inside an isolation boundary you control.
