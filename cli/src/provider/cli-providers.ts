/*
 * 0.6.11 (r4 1a095e087, the desktop's Voce 199): the kernel's registry has a provider the CLI can never serve — `locale-ospite`
 * («On this device»), the model an app keeps open on its own socket (the phone app, or the desktop hosting it). The CLI hosts no
 * such app, so without it the provider answered LOCAL_RUNTIME_NOT_READY on every request, and /provider listed it as «local · on
 * this computer · no key needed», usable. It is left out of the CLI's copy of the registry, so no list, no `model use` and no
 * resolver ever offers or accepts it. When the CLI hosts one (the remote control), it comes back here.
 */
export const PROVIDERS_THE_CLI_CANNOT_SERVE:ReadonlySet<string>=new Set(['locale-ospite']);

/** The kernel's registry without the providers the CLI cannot serve; the kernel's own object is never changed. */
export function cliProviderRegistry<T>(registry:Record<string,T>|null|undefined):Record<string,T>{
  if(!registry||typeof registry!=='object')return{};
  return Object.fromEntries(Object.entries(registry).filter(([id])=>!PROVIDERS_THE_CLI_CANNOT_SERVE.has(id)));
}
