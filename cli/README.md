# TALOS CLI

TALOS in your terminal: a coding agent that reads, edits and runs code in your project, on the model you choose. Every tool
asks before it acts unless you have allowed it, every file it changes can be restored, and every session can be resumed.

The npm package is **`talos-code`**; the command it installs is **`talos`**.

## Install

TALOS CLI needs **Node.js 24** (24.18 or later in the 24 line).

<!-- test:smoke -->
```bash
npm i -g talos-code
talos --version
```

Tested on Windows 11 x64. macOS and Linux are not tested yet.

## Start

Open a terminal in a project and run:

<!-- test:smoke -->
```bash
talos
```

The first time, a short guided setup asks only what is missing: whether to trust the folder, then a provider (a local
engine that is running comes first), its key, and a model, one step at a time; Esc skips a step. `/setup` or
`talos setup` runs it again. A key already in your environment (for example `OPENAI_API_KEY`) is used only after you
agree once; otherwise you type it in hidden input and it is kept in the operating system's credential store, never in a
file. For OpenRouter you can also sign in in the browser instead of pasting a key (`talos provider login openrouter`).

For a one-shot task, without the interactive screen:

<!-- test:smoke -->
```bash
talos -p "inspect this repository and explain the failing tests"
```

For machine-readable output:

<!-- test:smoke -->
```bash
talos -p "summarize the changes" --json
```

## Models

Cloud providers: OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, Mistral, Groq, xAI, Kimi, Qwen, Z.AI, MiniMax,
Cerebras, Together, Fireworks, DeepInfra, Novita, Nebius, Hugging Face, Azure AI Foundry, Amazon Bedrock and Google
Vertex AI. Local engines: Ollama, LM Studio and llama.cpp, with no key. TALOS never falls back from a local model to a cloud
one on its own.

`/provider` sets up a provider, `/model` (or `Alt+P`) picks the model, and `talos doctor` says what is ready.
While sub-agents work, `Alt+A` lists them and Enter shows one agent's conversation live, read-only.

## What you can rely on

- **Permissions.** Each tool is allowed, asked or denied, per project. Modes: `default`, `acceptEdits`, `plan`, `auto`,
  `dontAsk`, `bypassPermissions`.
- **Undo.** `/undo` restores the files a turn changed, from checkpoints kept outside your repository and outside Git.
- **Sessions.** `/resume` and `/fork` open a picker; `talos --resume last` continues from the shell. Sessions can be exported
  and imported; an imported session never runs anything by itself.
- **Context.** With a model whose context window is known and at least 64k tokens, long conversations are compacted at
  half of the window, and the screen says when and how much.
- **Extensions.** MCP servers, hooks, plugins and custom commands, each trusted explicitly before it runs.

In the interactive screen, `?` on an empty prompt shows the keys, `/help` the commands, `Ctrl+L` or `/redraw` repaints.
`Shift+Enter` adds a line where the terminal reports it; `Ctrl+J` always does. Set `TALOS_REDUCED_MOTION=1` to turn the
animations off, or pass `--no-color`.

## Display settings

Open `/config` to change response width, notifications, mouse-wheel scrolling and what remains in the terminal
on exit. These choices are saved **only for you in the current project**, outside the repository. Up/Down selects
a row; Enter or Left/Right changes its value. Each successful change is saved immediately; Esc closes the panel.
An unsuccessful save leaves the previous value in place and shows an error you can retry.

Response width applies immediately, including answers already on screen. The other three settings are marked
**next launch** and apply when you next open TALOS. `/theme` remains the live theme picker.

`ui.maxProseWidth` accepts `null` (the default, full terminal width) or a whole number of columns of at least 40.
The panel offers full width, 60, 80, 100 and 120 columns; custom widths can be set in your configuration.
Only assistant paragraphs, headings, lists and quotes are constrained. Code, tables, user messages and raw
transcript view retain the available terminal width. Narrow terminals take precedence over the cap. Wrapping
does not insert line breaks into the stored answer, copied text or exported conversation.

## Terminal notifications

`ui.notifications` accepts `auto` (default), `bell`, or `off` in your configuration. For example, merge
`"notifications": "off"` into the existing `ui` object to disable notifications. The setting takes effect
when you next open TALOS.

TALOS announces a completed or failed turn and a request for approval only after the terminal reports that
it has lost focus. A terminal that never reports focus stays silent. Notifications use fixed messages;
prompts, filenames, commands and model answers are never included. Queued follow-ups do not announce the
intermediate completion, and cancelling a turn does not announce success.

In `auto`, Windows Terminal on Windows x64/x86 uses the bundled SnoreToast executable, iTerm2 uses OSC 9,
kitty OSC 99, and Ghostty OSC 777. Other terminals, SSH and multiplexers use BEL. Native Windows delivery
falls back to BEL on an explicit failure; an indeterminate timeout stays silent to avoid a duplicate alert.
`bell` always selects BEL. Whether a notification or sound is shown depends
on your terminal and operating system settings. SnoreToast registers its own Start menu shortcut on first
delivery, so Windows may display the sender as SnoreToast with **TALOS** in the title.

On terminals supporting OSC 9;4, the tab/taskbar shows indeterminate progress while a turn runs, an error
state after failure, and clears on completion, cancellation or exit. Progress remains enabled with
`ui.notifications: off`; no fabricated completion percentage is shown.

Automated Windows checks exercise the real CLI and terminal protocols with native delivery intercepted.
Visible desktop delivery still requires a manual check: start a turn, switch away from the terminal,
check for one completion notification, repeat while keeping focus (no notification), then check an approval
request while away. On exit, the progress indicator must clear. Real desktop delivery on Windows and
delivery in iTerm2/kitty/Ghostty have not yet been verified on their target applications.

## Your data

Nothing is sent anywhere except:

- your prompts and the files TALOS reads, to the provider you chose;
- the public model catalogue at models.dev, for context windows and prices, cached for 4 hours. Turn it off with
  `talos config set catalog.modelsDev false` or `TALOS_MODELS_DEV=off`;
- the npm registry, only when you run `talos update`.

There is no telemetry. Configuration, sessions, checkpoints and logs stay on your machine:

| | Windows | macOS / Linux |
|---|---|---|
| Configuration | `%APPDATA%\TALOS-CLI` | `~/.config/talos-cli` |
| Sessions, checkpoints, logs | `%LOCALAPPDATA%\TALOS-CLI` | `~/.local/state/talos-cli` |

## Update

<!-- test:smoke -->
```bash
talos update --check
```

With an npm install, `talos update` tells you if a newer version exists and the command to run
(`npm i -g talos-code@latest`). It does not change anything by itself.

## Known limits

- Only Windows 11 x64 is tested.
- Context compaction with a local Ollama model is not yet verified end to end.
- A local provider that answers 401/403 without needing a key can be set aside as if its key were wrong.

## Help

`talos --help` lists every command, `/help` does the same inside the interactive screen, and `talos doctor` says what is
missing when something does not work. `talos diagnostic bundle --out talos-diagnostic.zip` makes a redacted report for a
bug; it contains no prompt or file content. Add `--session <id|last>` to include that one conversation: keys, tokens and
the paths of your home folder and this project are masked, but other paths, names, code, file contents and anything you typed are not, so read it before you share it.

What changed in each version is in `CHANGELOG.md`.

## License

AGPL-3.0-only. See `LICENSE` and `THIRD_PARTY_NOTICES.md` in this package.
