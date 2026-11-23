/*
 * R2 CONTRACT (owner: lane K; stub written by the coordinator so parallel lanes compile). The ONE missing-key sentence,
 * used verbatim by the TUI refusal, `-p` (text and JSON message), `provider test` and `doctor` (Q-R2-7, gate E8).
 * Lanes other than K only CALL `missingKeyText`; lane K owns the implementation and may not change the signature.
 *
 * ⛔ Where the label and the variable come from, measured: the kernel's registry (`harness-ui/src/provider-registry.mjs`,
 *   `REGISTRO_FORNITORI[id].etichetta` and `.auth.nomeVariabile`), the table every path already reads. The CLI's
 *   `ProviderDefinition.env` (`provider/store.ts`) is used by no production path. The registry is a kernel module loaded
 *   asynchronously from the repo root, so the composition hands it here once (`useProviderRegistry`) and this function stays
 *   synchronous. The variable is the FIRST one (gate E8): `kimi` names MOONSHOT_API_KEY, the one the store reads first.
 * ⛔ A provider the registry does not name gets the sentence without a variable, never an invented one.
 */
import {providerLabelText} from './provider-text.ts';
import {t} from '../i18n/index.ts';
import {keyVariablesFor,type ProviderRegistry} from './environment-keys.ts';

let registry:ProviderRegistry={};
/** Called by the composition with the kernel's registry; the last composition in the process wins (the table is the same). */
export function useProviderRegistry(value:ProviderRegistry|null|undefined){registry=value&&typeof value==='object'?value:{};}

/** The provider id for `ref`, which is an id or (for a caller that only holds a row's label) a label. */
function providerIdOf(ref:string):string|null{
  if(Object.hasOwn(registry,ref))return ref;
  for(const [id,record] of Object.entries(registry))if(record?.etichetta===ref||providerLabelText(id,'')===ref)return id;
  return null;
}

/**
 * The label a person reads for `ref` (an id or a label); `fallback` (or `ref`) when the registry does not know it.
 * ⛔ Open (gate §1.4, E4 "provider id for labels"): four registry labels carry Italian (`esterno`, `local`, `zai-anthropic`,
 *   `minimax-anthropic`). They are NOT replaced here alone: the provider overlay takes its label from `provider/control-plane.ts`,
 *   and an English label in this sentence under an Italian overlay title was measured in one frame. This function is the seam
 *   for that mapping once every surface reads it.
 */
export function providerLabel(ref:string,fallback:string=ref):string{
  const id=providerIdOf(ref);if(!id)return fallback;
  return providerLabelText(id,String(registry[id]?.etichetta??id));
}

export function missingKeyText(providerId:string):string{
  const id=providerIdOf(providerId);
  if(!id)return t('key.missing.noEnv',{provider:providerId,id:providerId});
  const provider=providerLabel(id);
  /* «Continue with ChatGPT» (13/10/2026): a provider the person signs in to has no key to set */
  if(registry[id]?.auth?.tipo==='oauth-pkce')return t('key.missing.signIn',{provider,id});
  const env=keyVariablesFor(registry,id)[0];
  return env?t('key.missing',{provider,env,id}):t('key.missing.noEnv',{provider,id});
}

/** Every environment variable the store reads a key of `ref` from, in its order (`[]` for a provider the registry does not name). */
export function keyVariablesOf(ref:string):string[]{
  const id=providerIdOf(ref);
  return id?keyVariablesFor(registry,id):[];
}

/**
 * `talos provider env-key <id>` with nothing set (14/10/2026): the sentence names the variable to set — every one the store reads,
 * in its order — instead of only saying that nothing was found. A provider with no variable keeps the bare sentence.
 */
export function environmentKeyNotFoundText(ref:string,label:string=providerLabel(ref)):string{
  const names=keyVariablesOf(ref);
  return names.length?`No key for ${label} was found in the environment (set ${names.join(' or ')}).`:`No key for ${label} was found in the environment.`;
}
