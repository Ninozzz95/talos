/*
 * Owner 13/10/2026 («Modello a scelta per i sotto-agenti»): the models a sub-agent may be given when the person asks for one.
 *
 * Until now the CLI handed the kernel no list, and the kernel then refuses EVERY model asked for a child ("this app cannot choose
 * a model for a sub-task here: omit modello", harness-ui/src/session-registry.mjs `verificaModelloChiesto`): a child always ran
 * on its parent's model. The desktop has one list for this since R-02 (12/10/2026, harness-ui/src/modelli-utilizzabili.mjs, wired
 * at harness-ui/server.mjs:229-236 and :651): the models this app can use NOW, from the same sources as its model picker. The CLI
 * uses that same module, fed from ITS model picker (`tui/catalog-service.ts`), so the ids are the ones `/model` shows:
 *  - every provider whose key is usable now (or that needs none and is not a local engine): its list, `<provider>:<id>` (OpenRouter
 *    too: `openrouter:vendor/model`, never the bare id — the kernel compares the exact string);
 *  - the ChatGPT plan when somebody is signed in with the plan enabled: `chatgpt:<slug>`;
 *  - a local engine (Ollama, LM Studio) that answers: the models it has installed.
 *  Not offered: the built-in llama.cpp engine (`local:<model>`). The picker has no list for it and the CLI holds no supervisor
 *  state to read (the kernel module's `statoLocale` door is not wired): a child of such a session runs on its parent's model.
 * ⛔ The module's own rule is kept: each source answers alone and within a time limit; one that is down means "those models, not
 *   now", never "none"; when NOTHING can be read the list is null and the kernel says "the list is not available right now",
 *   which is true, instead of "that model does not exist", which would be false. No key and no token come out of here: ids only.
 * ⛔ Review of 13/10/2026 (bugfixer): the picker does not throw when it cannot read a provider — it answers with the rows it already
 *   knows, none of them live, or with none (a plan nobody signed in to, an engine that is not running). A source with NOTHING TO
 *   OFFER is therefore a FAILED source here: counted as answered, it turned "nothing could be read" into an empty list, and the
 *   kernel then said of a model that exists that it "is not one of the models this app can use".
 * ⛔ What a source offers is decided from the picker's `listing` (owner 13/10/2026: «Sì, i modelli che già scegli in /model»):
 *   - `live` (or not said): the rows the provider, the account or the engine listed just now; a row that is only written in the
 *     registry or in the configuration is not offered next to them, the person would be told it runs on a model nobody listed;
 *   - `known-only` — a provider that has NO live list at all (its models are documented or configured: zai-anthropic, vertex,
 *     azure, bedrock, a 404 answered from the documentation): the rows the picker shows for it, the ones the person already
 *     chooses in /model for the session itself;
 *   - `unreachable`, `signed-out`, `engine-down`: nothing — the source failed.
 * ⛔ Cost (same review): calls that arrive together share one reading, and a list that was read is kept for 30 s, so five children
 *   given a model do not ask every provider five times; "not available" is never kept. Every source is asked with a time limit
 *   it can obey (the kernel module's 8 s), the list of providers included. Reading the picker still does what opening /model
 *   does (it remembers the windows and prices a provider lists, and that the plan answered): that belongs to the picker and is
 *   left as it is.
 */
import {importTalosModule} from './repo.ts';

export type UsableModelsProvider={id:string;configured:boolean;requiresKey:boolean;local:boolean;authType?:string};
export type UsableModelsSources={
  /** The providers as the picker lists them (`TuiCatalogService.listProviders`). */
  listProviders:()=>Promise<readonly UsableModelsProvider[]>;
  /** One provider's models as the picker lists them (`TuiCatalogService.providerModels`): ids already `<provider>:<id>`. */
  providerModels:(provider:string,signal?:AbortSignal)=>Promise<{rows:ReadonlyArray<{id:string;availabilityVerified?:boolean}>;listing?:string}>;
};
export type UsableModels={list():Promise<string[]|null>};

const LOCAL_ENGINES=new Set(['ollama','lmstudio']);
/** The kernel module's own limit for one source (`TEMPO_MASSIMO_MS`, modelli-utilizzabili.mjs). */
const SOURCE_TIMEOUT_MS=8_000;
const KEEP_MS=30_000;
/* never shown and never leaves this file: the kernel module only counts the source as failed (so it carries no error code) */
const nothingToOffer=()=>new Error('this source has no model to offer now');

export function createUsableModels({repoRoot,sources,timeoutMs,keepMs=KEEP_MS,now=Date.now}:{repoRoot:string;sources:UsableModelsSources;timeoutMs?:number;keepMs?:number;now?:()=>number}):UsableModels{
  const limit=timeoutMs&&timeoutMs>0?timeoutMs:SOURCE_TIMEOUT_MS;
  let module:Promise<any>|null=null;
  const kernel=()=>module??=importTalosModule(repoRoot,'modelli-utilizzabili.mjs');
  const within=<T>(work:Promise<T>):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;
    return Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(nothingToOffer()),limit);timer.unref?.();})]).finally(()=>clearTimeout(timer));};
  /* what ONE source offers a child; a source with nothing to offer throws, so the kernel module counts it as failed */
  const offered=async(provider:string):Promise<Array<{id:string}>>=>{
    const list=await sources.providerModels(provider,AbortSignal.timeout(limit));
    const listing=list.listing??'live';
    if(listing!=='live'&&listing!=='known-only')throw nothingToOffer();
    const ids=list.rows.filter(row=>listing==='known-only'||row.availabilityVerified===true).map(row=>({id:row.id})).filter(row=>typeof row.id==='string'&&row.id.trim()!=='');
    if(!ids.length)throw nothingToOffer();
    return ids;
  };
  async function read():Promise<string[]|null>{
    let providers:readonly UsableModelsProvider[];
    try{providers=await within(Promise.resolve().then(()=>sources.listProviders()));}catch{return null;}
    const usable=providers.filter(row=>row.configured);
    /* remote providers go through the module's "direct provider with its key" door; the picker already says which are usable */
    const direct=usable.filter(row=>!LOCAL_ENGINES.has(row.id)&&!(row.local&&!row.requiresKey)).map(row=>row.id);
    const engines=usable.filter(row=>LOCAL_ENGINES.has(row.id)).map(row=>row.id);
    let created:any;
    try{
      created=(await kernel()).creaModelliUtilizzabili({
        fornitoriDiretti:direct,leggiChiave:(provider:string)=>direct.includes(provider)?'usable':null,
        elencaFornitore:async(provider:string)=>({modelli:await offered(provider)}),
        /* the module prefixes a local engine's ids itself (`<engine>:<id>`): it is given them bare */
        runtimeLocali:Object.fromEntries(engines.map(engine=>[engine,{listModels:async()=>(await offered(engine)).map(row=>({id:row.id.startsWith(`${engine}:`)?row.id.slice(engine.length+1):row.id}))}])),
        tempoMassimoMs:limit,
      });
    }catch{return null;}
    /* every source that answers has something to offer (`offered`), so a list that comes back empty read nothing either */
    try{const ids=await created.elenco();return Array.isArray(ids)&&ids.length?ids:null;}catch{return null;}
  }
  let kept:{at:number;ids:string[]}|null=null;let reading:Promise<string[]|null>|null=null;
  return{
    async list(){
      if(kept&&now()-kept.at<keepMs)return[...kept.ids];
      reading??=read().then(ids=>{if(ids)kept={at:now(),ids};return ids;}).finally(()=>{reading=null;});
      const ids=await reading;
      return ids?[...ids]:null;
    },
  };
}
