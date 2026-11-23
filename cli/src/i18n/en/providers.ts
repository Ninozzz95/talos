/*
 * R2 integration (D-05: "Agente esterno" in the provider list): English labels and descriptions for the kernel's provider
 * registry (harness-ui/src/provider-registry.mjs, `etichetta`/`descrizione`, measured 2026-09-24: 4 of 29 labels and 25 of 29
 * descriptions Italian). Keyed by provider id; a provider without an entry keeps the registry text, and
 * `test/i18n/providers-english.test.ts` fails when that text is not English, so a new Italian entry cannot slip in.
 */
export const providers={
  'provider.esterno.label':'External agent',
  'provider.esterno.description':'An agent installed on this computer.',
  'provider.kimi.description':'Kimi models, direct international connection.',
  'provider.minimax.description':'MiniMax models, direct international connection.',
  'provider.qwen.description':'Qwen models, direct international connection.',
  'provider.zai.description':'GLM models through the Z.AI direct API.',
  'provider.openrouter.description':'Aggregator: hundreds of models behind a single key.',
  'provider.ollama.description':'Local Ollama engine on this computer.',
  'provider.lmstudio.description':'Local LM Studio engine on this computer.',
  'provider.groq.description':'Models through Groq.',
  'provider.cerebras.description':'Models through Cerebras.',
  'provider.mistral.description':'Models through Mistral.',
  'provider.together.description':'Models through Together.',
  'provider.fireworks.description':'Models through Fireworks.',
  'provider.deepinfra.description':'Models through DeepInfra.',
  'provider.novita.description':'Models through Novita.',
  'provider.nebius.description':'Models through Nebius.',
  'provider.xai.description':'Models through xAI.',
  'provider.ollama-cloud.description':'Models through Ollama Cloud.',
  'provider.huggingface.description':'Hugging Face model inference, catalog and downloads.',
  'provider.zai-anthropic.label':'Z.AI (Anthropic endpoint)',
  'provider.zai-anthropic.description':'GLM models through the Z.AI coding plan endpoint.',
  'provider.minimax-anthropic.label':'MiniMax (Anthropic endpoint)',
  'provider.minimax-anthropic.description':'MiniMax models through the Anthropic-compatible endpoint (international access).',
  'provider.azure.description':'Models from your own Azure resource.',
  'provider.bedrock.description':'Models available in the chosen region.',
  'provider.vertex.description':'Models of the chosen project and region.',
  'provider.local.label':'Local engine (llama.cpp)',
  'provider.local.description':'The llama-server supervisor of this computer.',
} as const;
