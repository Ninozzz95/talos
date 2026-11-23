# Providers and models

TALOS CLI uses the provider registry and adapters from TALOS. Cloud providers: OpenAI, Anthropic, Google Gemini, DeepSeek,
OpenRouter, Mistral, Groq, xAI, Kimi, Qwen, Z.AI, MiniMax, Cerebras, Together, Fireworks, DeepInfra, Novita, Nebius, Hugging
Face, Azure AI Foundry, Amazon Bedrock and Google Vertex AI. Local engines, with no key: Ollama (the first tested local
target), LM Studio and llama.cpp.

A key already in the environment under the provider's documented variable (for example `OPENAI_API_KEY` or
`ANTHROPIC_API_KEY`) is used only after you agree once; the answer is remembered per provider.

## Ollama

Configure a local Ollama endpoint:

<!-- test:smoke -->
```powershell
talos provider configure ollama --endpoint http://127.0.0.1:11434 --timeout 30
```

Select a model:

<!-- test:smoke -->
```powershell
talos model use ollama:qwen3-coder --scope user
```

List models known for a provider:

<!-- test:smoke -->
```powershell
talos model list --provider ollama --json
```

## Cloud keys

Keys are entered through hidden terminal input and stored in the OS credential store. Do not put them on the command line.

<!-- test:smoke -->
```powershell
talos provider set-key openai
```

Test configured provider connectivity:

<!-- test:smoke -->
```powershell
talos provider test openai --json
```

TALOS never falls back from a local model to a cloud provider implicitly.

## Interactive provider and model selection

In the TUI, `/provider` opens the registry-driven provider setup/status picker and `Alt+P` (or `/model` without an argument) opens the model picker. The provider surface includes valid chat destinations from the TALOS provider registry, including keyless/local destinations such as Ollama; it is not hard-coded to only four providers.

Provider selection is not a second active-run provider state. It is a setup/status and model-drill-down surface. The effective model remains a single `provider:model` value. Selecting a model in the picker, or using `/model provider:model`, persists the choice at `project-user` scope and affects subsequent runs without mutating an already active request.

Provider connectivity is probed lazily rather than fanning out network calls when the picker opens. Credential entry is write-only in the UI and is never echoed. Local Ollama remains local; TALOS does not silently fall back to a cloud provider.
