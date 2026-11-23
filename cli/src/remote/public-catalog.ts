/*
 * The network switch of the public model list (judge v1546, «one line» step 3, 11/11/2026). OpenRouter's public catalog (`GET
 * https://openrouter.ai/api/v1/models`) leaves without a request of the person, so it follows the PC's one rule
 * (`harness-ui/src/catalogo-pubblico.mjs`, branch `prova/unione-rete-2026-11-11`, `a13649aa6`, `consentito`; judge v1584 for the order):
 *   1. `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` means ZERO requests, even with an OpenRouter key and an OpenRouter model chosen;
 *   2. an OpenRouter key, or a model of OpenRouter the person chose, opens it, also against her own «off» (the request serves her
 *      choice);
 *   3. the saved preference `models.publicCatalog` (`.catalogo-pubblico.json`: `{acceso, openrouterScelto}`) decides;
 *   4. nothing saved, or no data folder at all: OFF (owner 09/11/2026 23:41, `CATALOGO_PUBBLICO_DI_SERIE`).
 * A value of the variable nobody understands, or a file nobody can read, never opens the network (the PC refuses the variable at
 * start; a terminal that cannot ask keeps it off). Read at every request, as the PC does.
 * Precedent: Hermes skips a passive check when the config turns it off (`hermes_cli/source_check.py:537`); Codex lets an administrator
 * requirement win over the config (`codex-rs/app-server-protocol/src/protocol/v2/config.rs:457`).
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const PUBLIC_CATALOG_VARIABLE='TALOS_HARNESS_UI_CATALOGO_PUBBLICO';
export const PUBLIC_CATALOG_FILE='.catalogo-pubblico.json';
/** ⛔ The default, in one place: OFF (owner, 09/11/2026 23:41), as `CATALOGO_PUBBLICO_DI_SERIE` on the PC. */
export const PUBLIC_CATALOG_DEFAULT=false;

/** `off`, `0`, `false`, `no` turn it off; empty, `on`, `1`, `true`, `yes` leave the preference to decide; anything else is off. */
export function publicCatalogOffByEnvironment(raw:string|undefined):boolean{
  const value=String(raw??'').trim().toLowerCase();
  if(value===''||['on','1','true','yes'].includes(value))return false;
  return true;
}

type Saved={acceso?:boolean;openrouterScelto?:boolean};
function readSaved(dataRoot:string|undefined):Saved|null{
  if(!dataRoot)return{};
  let text:string;
  try{text=readFileSync(join(dataRoot,PUBLIC_CATALOG_FILE),'utf8');}catch(error){return (error as any)?.code==='ENOENT'?{}:null;}
  try{
    const value=JSON.parse(text);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    return{...(typeof value.acceso==='boolean'?{acceso:value.acceso}:{}),...(value.openrouterScelto===true?{openrouterScelto:true}:{})};
  }catch{return null;}
}

/** Whether the public list may be read NOW (called at every request). */
export function publicCatalogAllowed({dataRoot,env=process.env,hasOpenRouterKey=()=>false}:{dataRoot?:string;env?:Record<string,string|undefined>;hasOpenRouterKey?:()=>boolean}):boolean{
  /* judge v1584: the administrator's variable first, as `if (bloccato) return false` on the PC */
  if(publicCatalogOffByEnvironment(env[PUBLIC_CATALOG_VARIABLE]))return false;
  try{if(hasOpenRouterKey()===true)return true;}catch{/* a store that cannot answer opens nothing */}
  /* with no data folder (http-deps.ts `dataRoot` is optional) readSaved answers {} and never joins an undefined path: the default holds */
  const saved=readSaved(dataRoot);
  if(saved===null)return false;
  if(saved.openrouterScelto===true)return true;
  return typeof saved.acceso==='boolean'?saved.acceso:PUBLIC_CATALOG_DEFAULT;
}

/** A `fetch` for the catalog that never leaves the machine while the switch is off (the kernel then serves its built-in list). */
export function guardedCatalogFetch(allowed:()=>boolean,realFetch:typeof fetch):typeof fetch{
  return (async(url:any,init?:any)=>{
    if(!allowed())throw Object.assign(new Error('The public model list is off: nothing was sent to openrouter.ai.'),{code:'PUBLIC_CATALOG_OFF'});
    return realFetch(url,init);
  }) as typeof fetch;
}
