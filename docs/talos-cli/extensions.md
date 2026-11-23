# MCP, hooks, plugins and custom commands

Extensions are not trusted merely because they exist in the project. TALOS keeps declarations separate from machine/user trust.

List plugins:

<!-- test:smoke -->
```powershell
talos plugin list --json
```

Install a reviewed extension package from a local directory or ZIP:

<!-- test:smoke -->
```powershell
talos plugin install .\my-talos-extension.zip
```

Trust the installed plugin only after inspection:

<!-- test:smoke -->
```powershell
talos plugin trust my-extension
```

List custom commands from user and project command directories:

<!-- test:smoke -->
```powershell
talos command list --json
```

Render a custom command with positional variables:

<!-- test:smoke -->
```powershell
talos command run review src\main.ts
```

Test one configured MCP server:

<!-- test:smoke -->
```powershell
talos mcp test local-tools --json
```

## Extension package format

A directory or ZIP package uses `extension.json` at its root. The manifest declares its id, version, compatible TALOS CLI range and optional MCP, hooks and plugin component files. Installation only materializes the declarations; it never grants trust. A changed manifest or declaration must be reviewed and trusted again through the relevant `mcp`, `hook` or `plugin` command.

```json
{
  "schema": "talos.cli.extension.v1",
  "id": "review-kit",
  "name": "Review Kit",
  "version": "1.0.0",
  "talosCli": ">=0 <1",
  "components": {"plugin": "plugin.json"}
}
```

`talosCli` is compared on the major version of TALOS CLI: `>=0 <1` accepts every 0.x release, the line 0.1.0 starts. An
extension whose range excludes the running version is refused with `EXTENSION_INCOMPATIBLE`.
