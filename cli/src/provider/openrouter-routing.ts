/*
 * OpenRouter routing per model (owner 08/10/2026, «Tre cose insieme»): the `provider` object OpenRouter takes in a request (docs «Provider Routing», read
 * 08/10/2026: only, ignore, order, quantizations, require_parameters, allow_fallbacks, sort; a base slug such as `deepinfra` matches every variant), set per
 * model by the person in `models.<id>.providerRouting` — as Hermes (`provider_routing.models.<id>`, agent/chat_completion_helpers.py:469-487), Pi
 * (`compat.openRouterRouting`, packages/ai/src/types.ts:940) and OpenCode (`models.<id>.options.provider`, docs providers.mdx:1880) do. The kernel's OpenRouter
 * transport merges it into each request (runtime-owner-adapter.mjs `instradamentoFn`), next to the excluded list of decision 14 (`ignore` is a union).
 *
 * The one shipped default comes from a measurement, not a guess (08/10/2026, published 0.5.0, instrumented fetch, identical requests with 56 tools and
 * tool_choice auto): `z-ai/glm-5.3-flash` routed by default to OpenInference (fp4) answered without calling tools — writing the call as text, or saying it had
 * no write tool — pinned 0/2 and unpinned 0/2, while Z.AI fp8 called them 3/3 and DeepInfra fp4 2/2. Any entry the person writes for that model replaces
 * the default, `providerRouting: {}` removes it.
 */
export type ProviderRouting={only?:string[];ignore?:string[];order?:string[];quantizations?:string[];requireParameters?:boolean;allowFallbacks?:boolean;sort?:'price'|'throughput'|'latency'};

export const OPENROUTER_ROUTING_DEFAULTS:Readonly<Record<string,Readonly<ProviderRouting>>>=Object.freeze({
  'z-ai/glm-5.3-flash':Object.freeze({ignore:Object.freeze(['open-inference']) as unknown as string[]}),
});

/* OpenRouter's values (docs «Provider Routing», 08/10/2026) */
export const ROUTING_QUANTIZATIONS=Object.freeze(['int4','int8','fp4','mxfp4','nvfp4','fp6','fp8','mxfp8','fp16','bf16','fp32','unknown']);
const ROUTING_SORTS=Object.freeze(['price','throughput','latency']);
/* the same slug shape as the desktop's excluded list (provider-credential-store.mjs normalizzaEsclusi): a base slug and at most one variant */
const SLUG=/^[a-z0-9][a-z0-9._-]{0,47}(?:\/[a-z0-9][a-z0-9._-]{0,47})?$/u;
const LIST_MAX=30;
const KEYS=new Set(['only','ignore','order','quantizations','requireParameters','allowFallbacks','sort']);

const slugList=(value:unknown)=>Array.isArray(value)&&value.length<=LIST_MAX&&value.every(item=>typeof item==='string'&&SLUG.test(item));
/** Whether a `providerRouting` value is one OpenRouter would take; the config loader refuses it otherwise (CONFIG_INVALID_MODEL_ROUTING). */
export function validProviderRouting(value:unknown):value is ProviderRouting{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!KEYS.has(key)))return false;
  for(const key of ['only','ignore','order'])if(row[key]!==undefined&&!slugList(row[key]))return false;
  if(row.quantizations!==undefined&&!(Array.isArray(row.quantizations)&&row.quantizations.every(item=>ROUTING_QUANTIZATIONS.includes(item as string))))return false;
  for(const key of ['requireParameters','allowFallbacks'])if(row[key]!==undefined&&typeof row[key]!=='boolean')return false;
  if(row.sort!==undefined&&!ROUTING_SORTS.includes(row.sort as string))return false;
  return true;
}

/* the model id OpenRouter receives: the `openrouter:` source prefix is TALOS's, not part of the id */
const bareId=(id:string)=>id.replace(/^openrouter:/u,'');
let personal=new Map<string,ProviderRouting>();

/** `config.models` (validated by config/load.ts): the entries with a `providerRouting`, keyed by the bare OpenRouter id. */
export function setOpenRouterRouting(models:unknown){
  const next=new Map<string,ProviderRouting>();
  if(models&&typeof models==='object'&&!Array.isArray(models)){
    for(const [id,row] of Object.entries(models as Record<string,any>)){
      if(row&&typeof row==='object'&&validProviderRouting(row.providerRouting))next.set(bareId(id),row.providerRouting);
    }
  }
  personal=next;
}

/** The `provider` fields for one OpenRouter model, in OpenRouter's names; null when there is nothing to send. */
export function openRouterRoutingFor(model:unknown):Record<string,unknown>|null{
  if(typeof model!=='string'||!model)return null;
  const id=bareId(model);
  const routing=personal.get(id)??OPENROUTER_ROUTING_DEFAULTS[id];
  if(!routing)return null;
  const out:Record<string,unknown>={};
  for(const key of ['only','ignore','order','quantizations'] as const)if(routing[key]!==undefined)out[key]=[...routing[key]!];
  if(routing.requireParameters!==undefined)out.require_parameters=routing.requireParameters;
  if(routing.allowFallbacks!==undefined)out.allow_fallbacks=routing.allowFallbacks;
  if(routing.sort!==undefined)out.sort=routing.sort;
  return Object.keys(out).length?out:null;
}
