# TALOS CLI command reference

> Generated from the runtime slash-command and keybinding catalogs. Do not edit by hand.

## Slash commands

| Command | Description |
| --- | --- |
| `/help` | Commands and keys |
| `/board` | What is running, how it went |
| `/capability` | Tools, skills and connectors |
| `/provider` | Choose the AI provider |
| `/models` | Providers, and what this device can hold |
| `/setup` | Provider, key, model step by step |
| `/model [provider:model]` | Choose a model and its reasoning effort |
| `/effort [level]` | Choose reasoning effort |
| `/queue [show\|clear\|run]` | Show or manage queued follow-ups |
| `/busy [queue\|steer\|interrupt]` | Choose what Enter does while TALOS works |
| `/permissions [trust \| dry-run <shell command>]` | Permission mode and rules |
| `/plan` | Plan first, change nothing until you approve |
| `/zen` | Zen view: only the chat and the prompt |
| `/essential` | Essential view: chat, header and footer |
| `/full` | Full view: the side columns too |
| `/sidebar` | Open or close the left bar |
| `/home` | Your workspace: where to pick up |
| `/new` | New session: where and how to work |
| `/shelf` | Your conversations as floppy disks on a shelf |
| `/panel [context \| agents]` | Open or close the right panel, or open one of its cards |
| `/diff` | Current Git diff, file by file |
| `/status` | Version, model, project, connections |
| `/agents [stop\|show] [n\|id\|all]` | Agents of this session, live |
| `/context` | What fills the context window |
| `/transcript` | Search the whole conversation (ctrl+o) |
| `/usage` | Tokens and cost by day and by model |
| `/compact` | Summarise the conversation to free context |
| `/clear` | Clear the screen; the conversation stays saved |
| `/redraw` | Repaint the whole screen |
| `/resume [session-id]` | Pick up an earlier conversation |
| `/fork [session-id]` | Branch this conversation from a message |
| `/export [md\|json\|jsonl] [file]` | Save the conversation to a file or the clipboard |
| `/rename <name>` | Name this conversation |
| `/theme [name]` | Pick a theme, previewed live |
| `/config` | Personal display settings for this project |
| `/trust` | Answer again whether TALOS trusts this folder |
| `/undo` | Go back to an earlier point (/rewind, /checkpoint) |
| `/retry` | Send the last message again |
| `/copy [n]` | Copy an answer or one of its code blocks |
| `/history` | Your messages in this project |
| `/mcp [list\|test\|trust\|untrust] [server-id]` | MCP servers, their tools and trust |
| `/hooks [list\|dry-run\|history\|trust\|untrust\|quarantine\|release] [hook-id] [args...]` | What runs on which event |
| `/plugins [list\|install\|remove\|trust\|untrust\|quarantine\|release] [plugin-id] [args...]` | Installed and available plugins |
| `/doctor [args...]` | Check the installation |
| `/memory [args...]` | What TALOS remembers about you and the project |
| `/notes [args...]` | Your notes, in Markdown |
| `/tasks [args...]` | Tasks of this project |
| `/library [args...]` | Files you keep for TALOS to read |
| `/research [args...]` | Deep Research reports |
| `/projects` | Find the workspaces and the sessions linked to them |
| `/automations [args...]` | Runs that start by themselves |
| `/forge [args...]` | Tools TALOS built for this project |
| `/remote` | Pair a device with this computer: a QR, then a code to compare |
| `/devices` | The devices paired with this computer, their folders; pair or revoke one |
| `/processes` | The commands the chats of this window ran; stop one or all |
| `/exit` | Leave TALOS |

## Built-in keymap

Interactive `/help` renders the effective keymap after user/project-user overrides; this table documents the built-in defaults.

| Action | Context | Keys | Description |
| --- | --- | --- | --- |
| `submit` | `composer` | `Enter` | Send prompt; while TALOS works, queue, steer or interrupt as /busy says, queue by default |
| `newline` | `composer` | `Shift+Enter` / `Ctrl+J` | Insert newline |
| `interrupt` | `global` | `Ctrl+C` / `Esc` | Cancel the run; close a dialog; clear the draft (Up brings it back) |
| `exit` | `global` | `Ctrl+D` / `Ctrl+C Ctrl+C` | Exit: press twice on an empty composer |
| `clear-draft` | `composer` | `Esc Esc` | Clear the draft; Up brings it back |
| `undo` | `composer` | `Ctrl+Z` / `Alt+Z` | Undo editor change |
| `redo` | `composer` | `Ctrl+Shift+Z` / `Alt+Shift+Z` / `Alt+/` | Redo editor change |
| `vim-toggle` | `composer` | `Alt+V` | Toggle Vim input (NORMAL h/j/k/l b/w 0/$ x u Ctrl+R i/a/I/A; INSERT Esc) |
| `steer` | `composer` | `Ctrl+Enter` / `Alt+S` | Steer active run at next safe boundary |
| `agent-tree` | `composer` | `Alt+A` | Inspect native agent tree |
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
| `palette` | `composer` | `Tab` | Complete a command or an @ path |
| `transcript-search` | `transcript` | `Alt+T` | Search transcript |
| `transcript-raw` | `transcript` | `Alt+R` | Toggle sanitized raw transcript |
| `transcript-copy` | `transcript` | `Alt+C` | Copy selected transcript item |
| `page-up` | `transcript` | `PageUp` | Scroll transcript up |
| `page-down` | `transcript` | `PageDown` | Scroll transcript down |
| `transcript-top` | `transcript` | `Ctrl+Home` | Scroll transcript to the first message |
| `transcript-bottom` | `transcript` | `Ctrl+End` | Scroll transcript to the latest output |
| `redraw` | `global` | `Ctrl+L` | Redraw the screen (also /redraw) |
| `view-zen` | `global` | `Alt+L` | Zen view on or off (also /zen) |
| `view-bar` | `global` | `Alt+N` | Left bar: open and focus it, close it |
| `view-panel` | `global` | `Alt+D` | Right panel: open it, close it |
| `view-centre` | `global` | `Alt+J` | The centre: Chat or Review |
| `view-home` | `global` | `Alt+H` | Home |
| `view-context` | `global` | `Alt+X` | Context Manager |
| `view-new` | `global` | `Alt+O` | New session |
| `view-card-1` | `global` | `Alt+1` | Panel: the Context card |
| `view-card-2` | `global` | `Alt+2` | Panel: the Agents card |
| `permission-cycle` | `global` | `Shift+Tab` / `Alt+M` | Cycle manual, accept edits, plan and Full access (confirmation on first entry) |
| `model-picker` | `composer` | `Alt+P` | Open model picker (the provider list first when none is chosen) |
| `reasoning-toggle` | `global` | `Ctrl+T` | Show or hide all reasoning; the choice is remembered |
| `external-editor` | `composer` | `Ctrl+G` | Open configured external editor |
| `transcript-mode` | `global` | `Ctrl+O` | Transcript and search |
| `approval-once` | `approval` | `1` | Allow once |
| `approval-session` | `approval` | `2` | Allow for this session |
| `approval-always` | `approval` | `3` | Always allow matching operation |
| `approval-deny-once` | `approval` | `4` | Deny; the turn goes on |
| `approval-deny-always` | `approval` | `5` | Always deny matching operation (in the full review) |
| `approval-deny-tool` | `approval` | `6` | No to this tool until your next message (connector, plugin and Tool Forge cards) |
| `approval-cancel` | `approval` | `Esc` / `Ctrl+C` | Deny and stop the turn (Esc in the full review goes back) |
| `approval-view` | `approval` | `v` | Open or close the full review |
| `approval-up` | `approval` | `Up` | Move the highlight up |
| `approval-down` | `approval` | `Down` | Move the highlight down |
| `approval-confirm` | `approval` | `Enter` | Choose the highlighted answer |
| `overlay-close` | `help` | `Esc` / `Enter` / `?` | Close help |
| `help` | `composer` | `?` | Show keyboard help |
| `picker-up` | `model-picker` | `Up` / `Left` | picker up |
| `picker-down` | `model-picker` | `Down` / `Right` | picker down |
| `picker-page-up` | `model-picker` | `PageUp` | picker page up |
| `picker-page-down` | `model-picker` | `PageDown` | picker page down |
| `picker-home` | `model-picker` | `Home` | picker home |
| `picker-end` | `model-picker` | `End` | picker end |
| `picker-confirm` | `model-picker` | `Enter` | picker confirm |
| `picker-cancel` | `model-picker` | `Esc` | picker cancel |
| `picker-backspace` | `model-picker` | `Backspace` | picker backspace |
| `picker-up` | `provider-picker` | `Up` / `Left` | picker up |
| `picker-down` | `provider-picker` | `Down` / `Right` | picker down |
| `picker-page-up` | `provider-picker` | `PageUp` | picker page up |
| `picker-page-down` | `provider-picker` | `PageDown` | picker page down |
| `picker-home` | `provider-picker` | `Home` | picker home |
| `picker-end` | `provider-picker` | `End` | picker end |
| `picker-confirm` | `provider-picker` | `Enter` | picker confirm |
| `picker-cancel` | `provider-picker` | `Esc` | picker cancel |
| `picker-backspace` | `provider-picker` | `Backspace` | picker backspace |
| `picker-up` | `session-picker` | `Up` / `Left` | picker up |
| `picker-down` | `session-picker` | `Down` / `Right` | picker down |
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
