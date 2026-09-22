# TALOS CLI command reference

> Generated from the runtime slash-command and keybinding catalogs. Do not edit by hand.

## Slash commands

| Command | Description |
| --- | --- |
| `/help` | Show commands |
| `/provider` | Choose the AI provider |
| `/model [provider:model]` | Choose a model from the chosen provider |
| `/queue [show\|clear\|run]` | Show or manage queued follow-ups |
| `/permissions [dry-run <shell command>]` | Show permission mode |
| `/plan` | Toggle plan-oriented guidance |
| `/diff` | Show current Git diff |
| `/status` | Show session status |
| `/context` | Show context/session information |
| `/compact` | Compact context |
| `/clear` | Clear terminal transcript |
| `/redraw` | Redraw terminal |
| `/resume [session-id]` | Resume a session |
| `/fork [session-id]` | Fork a session |
| `/mcp [args...]` | Manage MCP servers |
| `/hooks [args...]` | Manage hooks |
| `/plugins [args...]` | Manage plugins |
| `/doctor [args...]` | Run diagnostics |
| `/memory [args...]` | Memory operations |
| `/notes [args...]` | Notes operations |
| `/tasks [args...]` | Tasks operations |
| `/library [args...]` | Library operations |
| `/research [args...]` | Deep Research operations |
| `/automations [args...]` | Automation operations |
| `/forge [args...]` | Tool Forge operations |
| `/exit` | Exit TALOS |

## Built-in keymap

Interactive `/help` renders the effective keymap after user/project-user overrides; this table documents the built-in defaults.

| Action | Context | Keys | Description |
| --- | --- | --- | --- |
| `submit` | `composer` | `Enter` | Send prompt |
| `newline` | `composer` | `Shift+Enter` / `Ctrl+J` | Insert newline |
| `interrupt` | `global` | `Ctrl+C` / `Esc` | Cancel active run |
| `exit` | `global` | `Ctrl+D` / `Ctrl+C Ctrl+C` | Exit when idle |
| `undo` | `composer` | `Ctrl+Z` / `Alt+Z` | Undo editor change |
| `redo` | `composer` | `Ctrl+Shift+Z` / `Alt+Shift+Z` / `Alt+/` | Redo editor change |
| `vim-toggle` | `composer` | `Alt+V` | Toggle Vim input (NORMAL h/j/k/l b/w 0/$ x u Ctrl+R i/a/I/A; INSERT Esc) |
| `steer` | `composer` | `Alt+S` | Steer active run at next safe boundary |
| `left` | `composer` | `Left` / `Ctrl+B` | Move cursor left |
| `right` | `composer` | `Right` / `Ctrl+F` | Move cursor right |
| `home` | `composer` | `Home` / `Ctrl+A` | Move to line start |
| `end` | `composer` | `End` / `Ctrl+E` | Move to line end |
| `word-left` | `composer` | `Alt+B` | Move back one word |
| `word-right` | `composer` | `Alt+F` | Move forward one word |
| `select-left` | `composer` | `Shift+Left` | Extend selection left |
| `select-right` | `composer` | `Shift+Right` | Extend selection right |
| `select-home` | `composer` | `Shift+Home` | Extend selection to line start |
| `select-end` | `composer` | `Shift+End` | Extend selection to line end |
| `select-up` | `composer` | `Shift+Up` | Extend selection up |
| `select-down` | `composer` | `Shift+Down` | Extend selection down |
| `select-word-left` | `composer` | `Alt+Shift+B` | Extend selection back one word |
| `select-word-right` | `composer` | `Alt+Shift+F` | Extend selection forward one word |
| `copy-selection` | `composer` | `Alt+W` | Copy selection to yank buffer |
| `backspace` | `composer` | `Backspace` | Delete before cursor |
| `delete-forward` | `composer` | `Delete` / `Ctrl+D` | Delete at cursor |
| `kill-start` | `composer` | `Ctrl+U` | Cut to line start |
| `kill-end` | `composer` | `Ctrl+K` | Cut to line end |
| `kill-word` | `composer` | `Ctrl+W` | Cut previous word or selection |
| `yank` | `composer` | `Ctrl+Y` | Paste killed text |
| `history-prev` | `history` | `Up` / `Ctrl+P` | Previous prompt |
| `history-next` | `history` | `Down` / `Ctrl+N` | Next prompt |
| `history-search` | `history` | `Ctrl+R` | Search prompt history |
| `palette` | `composer` | `Tab` | Complete slash command |
| `transcript-search` | `transcript` | `Alt+T` | Search transcript |
| `transcript-raw` | `transcript` | `Alt+R` | Toggle sanitized raw transcript |
| `transcript-copy` | `transcript` | `Alt+C` | Copy selected transcript item |
| `page-up` | `transcript` | `PageUp` | Scroll transcript up |
| `page-down` | `transcript` | `PageDown` | Scroll transcript down |
| `permission-cycle` | `global` | `Shift+Tab` / `Alt+M` | Cycle safe permission modes |
| `model-picker` | `composer` | `Ctrl+L` | Open model picker |
| `provider-picker` | `composer` | `Alt+P` | Open provider picker |
| `reasoning-toggle` | `global` | `Ctrl+T` | Toggle reasoning visibility |
| `external-editor` | `composer` | `Ctrl+G` | Open configured external editor |
| `tool-details` | `global` | `Ctrl+O` | Toggle tool details |
| `approval-once` | `approval` | `1` | Allow once |
| `approval-session` | `approval` | `2` | Allow for session |
| `approval-always` | `approval` | `3` | Always allow matching operation |
| `approval-deny-once` | `approval` | `4` | Deny once |
| `approval-deny-always` | `approval` | `5` | Always deny matching operation |
| `approval-cancel` | `approval` | `Esc` / `Ctrl+C` | Deny current approval |
| `approval-view` | `approval` | `v` | Review full approval payload |
| `overlay-close` | `help` | `Esc` / `Enter` / `?` | Close help |
| `help` | `composer` | `?` | Show keyboard help |
| `picker-up` | `model-picker` | `Up` | picker up |
| `picker-down` | `model-picker` | `Down` | picker down |
| `picker-page-up` | `model-picker` | `PageUp` | picker page up |
| `picker-page-down` | `model-picker` | `PageDown` | picker page down |
| `picker-home` | `model-picker` | `Home` | picker home |
| `picker-end` | `model-picker` | `End` | picker end |
| `picker-confirm` | `model-picker` | `Enter` | picker confirm |
| `picker-cancel` | `model-picker` | `Esc` | picker cancel |
| `picker-backspace` | `model-picker` | `Backspace` | picker backspace |
| `picker-up` | `provider-picker` | `Up` | picker up |
| `picker-down` | `provider-picker` | `Down` | picker down |
| `picker-page-up` | `provider-picker` | `PageUp` | picker page up |
| `picker-page-down` | `provider-picker` | `PageDown` | picker page down |
| `picker-home` | `provider-picker` | `Home` | picker home |
| `picker-end` | `provider-picker` | `End` | picker end |
| `picker-confirm` | `provider-picker` | `Enter` | picker confirm |
| `picker-cancel` | `provider-picker` | `Esc` | picker cancel |
| `picker-backspace` | `provider-picker` | `Backspace` | picker backspace |
| `picker-up` | `session-picker` | `Up` | picker up |
| `picker-down` | `session-picker` | `Down` | picker down |
| `picker-page-up` | `session-picker` | `PageUp` | picker page up |
| `picker-page-down` | `session-picker` | `PageDown` | picker page down |
| `picker-home` | `session-picker` | `Home` | picker home |
| `picker-end` | `session-picker` | `End` | picker end |
| `picker-confirm` | `session-picker` | `Enter` | picker confirm |
| `picker-cancel` | `session-picker` | `Esc` | picker cancel |
| `picker-backspace` | `session-picker` | `Backspace` | picker backspace |
| `picker-up` | `command-menu` | `Up` | picker up |
| `picker-down` | `command-menu` | `Down` | picker down |
| `picker-page-up` | `command-menu` | `PageUp` | picker page up |
| `picker-page-down` | `command-menu` | `PageDown` | picker page down |
| `picker-home` | `command-menu` | `Home` | picker home |
| `picker-end` | `command-menu` | `End` | picker end |
| `picker-confirm` | `command-menu` | `Enter` | picker confirm |
| `picker-cancel` | `command-menu` | `Esc` | picker cancel |
| `picker-backspace` | `command-menu` | `Backspace` | picker backspace |
| `command-complete` | `command-menu` | `Tab` | Complete command |
