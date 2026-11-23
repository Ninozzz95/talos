/*
 * 0.6.15 remote control: what the kernel's HTTP handler needs beyond the session registry, taken from the CLI's own composition.
 * Measured 26/10/2026 (every operation of the kernel's closed list, through the in-process handler, on an isolated profile):
 * with the registry alone the session routes all answer, and three lists did not — `doctor` (REPORT_UNAVAILABLE), `models.list`
 * (REPORT_UNAVAILABLE), `providers.list` (PROVIDER_STORE_UNAVAILABLE). They get here the same pieces the desktop's server.mjs
 * hands them (r4 849c4fb17: `diagnosiFn`, `catalogoModelliFn`, `providerStore`, `catalogoChatgpt`), built from what the CLI has:
 * - the provider store IS the kernel's (`createProviderCredentialStore`, talos-composition.ts), so the desktop's routes read it as is;
 * - the doctor is the kernel's `diagnosi` (doctor.mjs), fed with the CLI's facts; the phone filters it (operazioni.mjs
 *   `doctorPerIlTelefono`) exactly as it filters the desktop's;
 * - the OpenRouter catalogue is the kernel's `createModelCatalog` (fetched only when a phone asks for the models);
 * - the ChatGPT plan's list comes through the composition's `chatgptCatalog`, which opens the plan only then.
 */
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {guardedCatalogFetch,publicCatalogAllowed} from './public-catalog.ts';

export type CliRemoteContext={
  registry:any;providerStore?:any;providerProbe?:any;searchSourceStore?:any;ownerRuntime?:any;chatgptCatalog?:{elenca():Promise<unknown>}|null;
};

/*
 * The owner's decisions 43 and 47 (03/11): a device's attachments live in TALOS's data, beside the sessions, never in the project; the old upload
 * route is gone, so without an archive a device on this window could attach nothing. One archive per folder in this process, shared by the
 * window's handler and the remote host. The CLI saves with the kernel's `salvaAllegatoSenzaAiutante` everywhere: the Windows helper is not in its
 * package, and the folder is TALOS's own, new for each file (the module's own condition, COD-248, the CLI's ritocco).
 */
const ARCHIVES=new Map<string,Promise<any>>();
async function attachmentArchive(load:(file:string)=>Promise<any>,sessionsRoot:string){
  const made=ARCHIVES.get(sessionsRoot)??Promise.all([load('allegati-dati.mjs'),load('allegato-senza-aiutante.mjs')]).then(([data,plain])=>{
    const archive=data.creaArchivioAllegati({cartella:data.cartellaDegliAllegati(sessionsRoot),salva:plain.salvaAllegatoSenzaAiutante});
    void archive.pulisci?.().catch(()=>{/* the next start cleans again */});
    return archive;
  });
  ARCHIVES.set(sessionsRoot,made);
  return made;
}
export async function cliHttpDeps(input:{repoRoot:string;context:CliRemoteContext;sessionsRoot?:string;importModule?:(file:string)=>Promise<any>;fetch?:typeof fetch;dataRoot?:string}):Promise<Record<string,unknown>>{
  const src=join(input.repoRoot,'harness-ui','src');
  const load=input.importModule??((file:string)=>import(pathToFileURL(join(src,file)).href));
  const [doctor,catalog]=await Promise.all([load('doctor.mjs'),load('model-catalog.mjs')]);
  const {registry,providerStore,providerProbe,searchSourceStore,ownerRuntime,chatgptCatalog}=input.context;
  /* judge v1546: the public list follows the PC's switch (public-catalog.ts), read at every request. The guarded fetch keeps the
     network shut on today's kernel too; `consentitoFn` is the PC kernel's own door (b95c81e7d), ignored by a kernel without it. */
  const allowed=()=>publicCatalogAllowed({...(input.dataRoot?{dataRoot:input.dataRoot}:{}),hasOpenRouterKey:()=>Boolean(providerStore?.hasKey?.('openrouter'))});
  const modelCatalog=catalog.createModelCatalog({fetchFn:guardedCatalogFetch(allowed,input.fetch??fetch),consentitoFn:allowed});
  const providerRows=()=>{try{return providerStore?.listPublic?.()??[];}catch{return[];}};
  const diagnosiFn=async()=>{
    let snapshot;
    try{snapshot=await ownerRuntime?.runtimeSnapshot?.();}catch(error){snapshot={status:'unavailable',reason:(error as any)?.code||'runtime_unavailable'};}
    return doctor.diagnosi({
      chiaveConfigurata:Boolean(providerStore?.hasKey?.('openrouter')),
      /* the CLI has no administrator folder list: a device's folders are the recent ones, with the PC's consent */
      cartelleProgetto:[],
      ricercaWeb:searchSourceStore?.listPublic?.(),
      labsAccesi:[],
      providerRows:providerRows(),
      providerStoreAvailable:Boolean(providerStore),
      ownerRuntime:doctor.statoDelServizioAgente({configurato:Boolean(ownerRuntime),snapshot}),
      catalogoTask:{disponibile:false,dettaglio:'The preset tasks list is not available in TALOS CLI.',dettaglioChiave:'server.doctor.catalog.unavailable'},
      sessioniPersistenza:typeof registry?.statoPersistenza==='function'?registry.statoPersistenza():undefined,
    });
  };
  const archivioAllegati=input.sessionsRoot?await attachmentArchive(load,input.sessionsRoot):null;
  return{
    ...(archivioAllegati?{archivioAllegati}:{}),
    ...(providerStore?{providerStore}:{}),
    ...(providerProbe?{providerProbe}:{}),
    ...(searchSourceStore?{searchSourceStore}:{}),
    ...(chatgptCatalog?{catalogoChatgpt:chatgptCatalog}:{}),
    catalogoModelliFn:(options?:{forzaAggiornamento?:boolean})=>modelCatalog.ottieni(options),
    diagnosiFn,
  };
}
