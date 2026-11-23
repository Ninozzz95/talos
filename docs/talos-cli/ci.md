# Headless and CI use

Headless mode does not render the Ink TUI. Standard output contains only the requested result format; diagnostics go to standard error.

Install it in a job with Node.js 24 (`actions/setup-node` with `node-version: 24`), then `npm i -g talos-code`. Pin the
version (`npm i -g talos-code@0.1.0`) so a new release does not change a pipeline by itself.

A single JSON result:

<!-- test:smoke -->
```powershell
talos -p "run tests and report only verified failures" --json --permission-mode dontAsk
```

A JSONL event stream:

<!-- test:smoke -->
```powershell
talos -p "review the repository" --output-format stream-json --permission-mode dontAsk
```

Resume a known session in a script:

<!-- test:smoke -->
```powershell
talos --resume 123e4567-e89b-12d3-a456-426614174000 -p "continue from the saved state" --json
```

Run diagnostics in CI:

<!-- test:smoke -->
```powershell
talos doctor --json
```

Provider secrets in CI should be injected by the CI secret manager for the process that needs them. Do not write secrets into repository configuration, logs or command arguments.

## Release provider gate

Published `talos-cli-v*` releases are additionally gated by one live text turn through each cloud integration: OpenAI, Anthropic and Google Gemini. Release automation requires `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` as repository secrets. Ollama is tested separately through the loopback Windows end-to-end gate, including a read/write/test/final coding loop.

The Windows end-to-end gate also starts a second CLI process with `--resume last` and verifies that the persisted session id is restored.
