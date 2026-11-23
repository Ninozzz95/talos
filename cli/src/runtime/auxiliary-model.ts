/*
 * 14/10/2026, owner («Il più economico dello stesso fornitore»): the side work of a conversation — the Context Engine's
 * summaries, the kernel's own compaction — runs on the provider's light model the kernel's registry declares
 * (`provider-registry.mjs` `modelloAusiliario`: Anthropic → Haiku, OpenAI → gpt-5-nano, Z.AI → glm-4.7-flash…), never on another
 * provider. A provider that declares none (the ChatGPT plan, a local engine, an endpoint with no qualified model) keeps the
 * conversation's own model. Claude Code runs its side tasks on Haiku; OpenCode has `small_model`; Hermes an auxiliary router
 * (agent/auxiliary_client.py).
 */
export type ModelSelection={provider:string;model:string};

/** The light model of the same provider for side work, or the conversation's own model when the provider declares none. */
export function auxiliaryModelFor(selection:ModelSelection,registry:Record<string,any>):ModelSelection{
  const declared=registry?.[selection.provider]?.modelloAusiliario;
  return typeof declared==='string'&&declared.trim()?{provider:selection.provider,model:declared.trim()}:selection;
}

/** The same for a model written `provider:model`; an id that cannot be split is returned as it is. */
export function auxiliaryModelId(model:string,registry:Record<string,any>):string{
  const at=model.indexOf(':');if(at<=0)return model;
  const chosen=auxiliaryModelFor({provider:model.slice(0,at),model:model.slice(at+1)},registry);
  return`${chosen.provider}:${chosen.model}`;
}
