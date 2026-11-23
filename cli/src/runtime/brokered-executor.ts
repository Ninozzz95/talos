import {t} from '../i18n/index.ts';
import {safeGitEnvironment} from '../workspace/safe-git.ts';
import {randomUUID} from 'node:crypto';
import {appendFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {TalosError} from '../errors.ts';
import type {EnforcementLevel,ExecutionBroker,ExecutionEvidence,ExecutionRequest} from '../security/execution-broker.ts';
import type {SandboxBoundaryEvidence} from '../security/sandbox-boundary-probe.ts';
import {mxcChildEnvironment} from '../security/mxc-execution-backend.ts';
import {sandboxNodeOptions} from '../security/sandbox-node-realpath.ts';
import {TOOL_OUTPUT_LIMIT,cutToolOutput,hasKernelCutMarker,replaceKernelCutMarker,type SavedToolOutput} from './output-store.ts';

/*
 * ⭐⭐⭐ B1 slice 8 — IL COMANDO SCRITTO DALLA PERSONA PASSA DAL BROKER, e lo DICE.
 *
 * Questa e' l'unica implementazione nuova della corsia: un adattatore che si infila nel seam che il
 * kernel espone GIA' — `eseguiComandoDiretto({eseguiComandoSandboxatoFn})` in
 * `harness-ui/src/agent-service.mjs` (L1975) — e che quindi eredita, senza riscriverli, il
 * vocabolario di eventi, l'accorpamento dei pezzi e la cucitura nella cronologia. (Il tracciamento
 * della cartella di lavoro NO: dal round 5 della fetta 12 il ramo brokerato non appende la coda della
 * cartella — vedi sotto.)
 *
 * ⛔ La firma e' quella POSIZIONALE del kernel (`eseguiComandoSandboxato(comando, cartella, opzioni)`),
 *   non una nuova: il CLI si conforma al kernel, mai il contrario.
 * ⛔ `harness-ui/` si LEGGE e non si scrive: la regola di troncamento (`uscitaUtile`) e l'esecutore di
 *   ripiego arrivano dal kernel per iniezione. `staccaCartellaFinale` e `codaCheStampaLaCartella`
 *   restano nel contratto degli aiutanti perche' il kernel li espone, ma il ramo brokerato non li usa.
 */

/** ⛔ I due codici di uscita documentati dal kernel: 124 = tempo scaduto, 130 = 128 + SIGINT. */
export const KERNEL_EXIT={timeout:124,stoppedOnRequest:130} as const;

/*
 * ⭐⭐⭐ B1 slice 12, round 5 — SUL RAMO BROKERATO NON SI APPENDE NIENTE AL COMANDO.
 *
 * Tre round di fila hanno ricostruito il codice d'uscita dopo la coda della cartella, e ognuno ha
 * aperto un buco nel codice d'uscita:
 *  · round 2, marcatore stampato: un'ultima riga senza a-capo lo incollava e la persona leggeva
 *    «exit 0» col token; un comando poteva stamparne uno e falsificare il codice nei due versi;
 *  · round 4, stato del processo via `call set` / `call exit`: DENTRO la sandbox MXC quei due nomi si
 *    risolvono in un `set.bat`/`set.cmd`/`exit.bat`/`exit.cmd` della cartella di lavoro. Misurato
 *    il 17/09/2026 con `findstr /c:zzz talos_absent.txt` (vero: 1): cmd dell'host 1, sandbox semplice
 *    1, ramo brokerato **0** con quei file presenti. E per `type mancante & echo ok` il ramo brokerato
 *    dava 1 mentre `cmd /c` semplice e il ripiego del kernel davano 0.
 * La coda esisteva solo perche' quella della cartella sovrascrive il codice d'uscita, e la coda della
 * cartella sul ramo cmd NON FUNZIONA comunque (`cartella: null` su cmd, misurato al round 2, sia qui
 * sia nel kernel). Costava onesta' e non comprava niente che funzioni oggi.
 *
 * ⇒ Si esegue `%ComSpec% /d /s /c <comando>` e basta. Il codice che la persona vede e' lo stato
 *   d'uscita del processo nella sandbox, riportato da `mxcSandboxedSpawn`; niente viene stampato,
 *   letto o tolto che il comando non abbia prodotto da se'.
 * ⛔ COSTO DICHIARATO, NON UNA REGRESSIONE: sul ramo brokerato un `cd` non persiste fra un comando e
 *   l'altro (`cartellaFinale` e' sempre null, e il registro tiene la cartella di prima). E' identico a
 *   oggi sul ramo cmd, dove la persistenza e' gia' rotta dal parser della cartella del kernel.
 */

/*
 * ⭐ B1 slice 12, round 2 — UN BROKER CHE NON SI E' POTUTO COSTRUIRE NON E' «NON CONFIGURATO».
 * Chi compone ripiega sull'esecuzione (fail-open) ma deve poterlo DIRE: questo sostituto rifiuta
 * ogni esecuzione con un codice che il ramo di ripiego riconosce, e porta il codice dell'errore
 * vero. Un difetto di contratto (un TypeError) arriva a schermo con il suo nome invece di sparire.
 */
export const BROKER_CONSTRUCTION_FAILED='EXECUTION_BROKER_CONSTRUCTION_FAILED';
export function createUnbuildableExecutionBroker(cause:unknown):ExecutionBroker{
  const code=typeof (cause as {code?:unknown})?.code==='string'?String((cause as {code:string}).code):cause instanceof Error?cause.name:'UNKNOWN_ERROR';
  const message=(cause instanceof Error?cause.message:String(cause)).split(/\r?\n/u)[0]!.slice(0,300);
  const detail=`${code}: ${message}`;
  return{async execute(request){throw new TalosError({code:BROKER_CONSTRUCTION_FAILED,component:'execution-broker',retryable:false,hint:detail,traceId:request.id},cause);}};
}

/*
 * The words of the execution row. R2 (gate E1, Q-R2-1): they live in the one dictionary, `src/i18n/en/screen.ts`
 * (`screen.exec.*`); this object keeps the shape its callers use. The `marker` block is NOT screen text: it is a
 * byte-identical copy of kernel constants (gate E2) and never enters the dictionary.
 *
 * ⛔⛔⛔ E la riga `enforcement` NON si accorcia. Misurato il 16/09/2026: una ricerca nel binario di
 *   Claude Code per una resa a schermo del suo flag «senza sandbox» torna ZERO, e il suo comando
 *   digitato dall'utente gira sempre fuori dall'isolamento senza dirlo; la barra di stato di Hermes,
 *   documentata campo per campo, non ha un campo isolamento. Entrambi approvano i comandi in
 *   allowlist in silenzio. Questa stringa e' l'unico posto in cui una persona scopre che il suo
 *   comando NON era isolato e PERCHE': toglierle la ragione la rende inutile.
 */
export const EXECUTION_TEXT={
  isolation:{
    /** Un backend ha eseguito e ha portato le prove: si nomina il backend. */
    sandbox:(backend:string)=>t('screen.exec.isolation.sandbox',{backend}),
    /** Il giro isolato e' finito prima di dire come: non si promette un isolamento che non e' provato. */
    sandboxWithoutEvidence:t('screen.exec.isolation.sandboxWithoutEvidence'),
    host:t('screen.exec.isolation.host'),
    /**
     * R0 lane S, owner decision 1 (review §J.1): the row of a command the PRODUCT wanted in the sandbox and ran on the
     * host. ⛔ Never "secure" or "safe" anywhere on this path (gate E6): MXC itself is "contained", not a boundary.
     */
    hostNotIsolated:t('screen.exec.isolation.hostNotIsolated'),
    wsl2:t('screen.exec.isolation.wsl2'),
    device:t('screen.exec.isolation.device'),
    other:(name:string)=>t('screen.exec.isolation.named',{name}),
  },
  reason:{
    /* F-021 (owner 03/10, «Banner solo misurato»): only what the host probe MEASURED inside the containment, plus the read grant this
       executor itself gives (the volume root, read-only: microsoft/mxc#1109). Never «verified» on a constant, never «AppContainer»
       unless the token carried its SID. */
    verified:(evidence:{network:string;boundary?:SandboxBoundaryEvidence})=>{
      const b=evidence.boundary;if(!b)return t('screen.exec.reason.unmeasured');
      const facts:string[]=[];
      if(b.writesOutside==='blocked')facts.push(t('screen.exec.fact.writesInside'));else if(b.writesOutside==='allowed')facts.push(t('screen.exec.fact.writesOutside'));
      if(evidence.network==='internet-client')facts.push(t('screen.exec.fact.networkAllowed'));else if(b.network==='blocked')facts.push(t('screen.exec.fact.networkBlocked'));else if(b.network==='open')facts.push(t('screen.exec.fact.networkOpen'));
      facts.push(t('screen.exec.fact.readsAll'),t('screen.exec.fact.processTree'));
      if(b.appContainer===true)facts.push(t('screen.exec.fact.appContainer'));
      return t('screen.exec.reason.measured',{facts:facts.join(', ')});
    },
    backendUnavailable:(why:string)=>t('screen.exec.reason.backendUnavailable',{why}),
    brokerNotConfigured:t('screen.exec.reason.brokerNotConfigured'),
    /** The broker exists in this build but could not be BUILT: never the same sentence as «not configured». */
    brokerConstructionFailed:(detail:string)=>t('screen.exec.reason.brokerConstructionFailed',{detail}),
    destinationMobile:t('screen.exec.reason.destinationMobile'),
    destinationWsl2:t('screen.exec.reason.destinationWsl2'),
    platformNotWindows:(platform:string)=>t('screen.exec.reason.platformNotWindows',{platform}),
    timedOut:(ms:number)=>t('screen.exec.reason.timedOut',{seconds:Math.round(ms/1_000)}),
    stoppedOnRequest:t('screen.exec.reason.stoppedOnRequest'),
    /* 14/10/2026: a command that went on in the background (the row says it, the answer says where its output goes) */
    movedToBackground:t('screen.exec.reason.movedToBackground'),
    /*
     * ⛔ R0 lane S — the declared host fallback. These rows are shared by the person's `!` commands AND the model's
     *   shell tool (M1-E: one executor), so they do not say who typed the command; the approval that precedes the
     *   run is the permission engine's, not this executor's.
     */
    sandboxUnverified:(why:string)=>t('screen.exec.reason.sandboxUnverified',{why}),
    brokerUnbuildable:(detail:string)=>t('screen.exec.reason.brokerUnbuildable',{detail}),
    hostPlatform:(platform:string)=>t('screen.exec.reason.hostPlatform',{platform}),
    hostNoBroker:t('screen.exec.reason.hostNoBroker'),
  },
  /*
   * ⛔ Le tre marche del kernel, riprodotte LETTERA PER LETTERA perche' il kernel non le esporta
   *   (`MARCA_FERMATO_MENTRE_GIRAVA` e `USCITA_FERMATO_SU_RICHIESTA` sono `const` di modulo, non
   *   `export`). Una prova legge il sorgente del kernel e verifica che siano ancora identiche: e'
   *   l'unico modo per accorgersi di una deriva, visto che la copia e' inevitabile.
   */
  /* K4 (desktop i18n): the kernel writes these marks in English now and still reads the Italian ones of saved histories
     (`contieneMarcaFermatoMentreGirava`); the CLI writes what the kernel writes. */
  marker:{
    stoppedOnRequest:'⛔ Stopped on request:',
    stoppedOnRequestSentence:'the command was stopped while it ran.',
    timedOut:(ms:number)=>`⛔ Stopped when the ${Math.round(ms/1_000)} seconds ran out: it did not finish on its own.`,
  },
  /** ⛔ Un comando senza sessione si RIFIUTA a voce alta: farlo sparire e' peggio che negarlo. */
  shellSessionRequired:t('screen.exec.shellSessionRequired'),
} as const;

/* `rete`: the network for THIS command (owner 09/10/2026, «Segue il modo + si chiede»): set by the kernel only after the person's yes, or by the CLI in Full access. */
export type KernelExecutorOptions={mobile?:boolean;onPezzo?:(piece:{flusso:'fuori'|'errori';testo:string})=>void;tracciaCartella?:boolean;dove?:string|null;segnaleStop?:AbortSignal;rete?:boolean;
  /* 14/10/2026 (owner, background like Claude Code), the kernel's own options (talosHarness.mjs `eseguiComandoSandboxato`): the
     call's time (the model's `timeout`), the row's «to the background» control and its output file, `background:true` */
  timeoutMs?:number;segnaleSfondo?:AbortSignal|null;fileSfondo?:string|null;inSfondoSubito?:boolean;
  /* Git sicuro: names added to the child's environment, after the credentials are taken out; the kernel ignores it on WSL and on a device */
  aggiunteAmbiente?:Record<string,string>|null};
export type BackgroundExit={codice:number|null;segnale:null;errore?:true};
export type KernelExecutorResult={codice:number|null;testo:string;enforcement:string;cartellaFinale?:string|null;fermatoDalTempo?:boolean;fermatoSuRichiesta?:boolean;
  /* the kernel's background answer (`creaGestoreSfondo`): the registry marks the row and, with `uscita`, wakes the chat (C06) */
  messoInSfondo?:true;daSfondo?:'avvio'|'tempo-scaduto'|'persona';fileSfondo?:string|null;parziale?:string;uscita?:Promise<BackgroundExit>};
/** ⛔ La firma POSIZIONALE del kernel, non una nuova: `eseguiComandoSandboxato(comando, cartella, opzioni)`. */
export type KernelExecutor=(comando:string,cartella:string,options?:KernelExecutorOptions)=>Promise<KernelExecutorResult>;
export type KernelTextHelpers={
  uscitaUtile:(testo:string,tetto?:number,quotaInTesta?:number)=>string;
  staccaCartellaFinale:(testo:string)=>{testo:string;cartella:string|null};
  codaCheStampaLaCartella:(perWindows:boolean)=>string;
  eseguiComandoSandboxato:KernelExecutor;
};
export type BrokeredKernelExecutorOptions={
  /** Caricatore pigro del kernel: si paga solo quando un comando parte davvero, e una volta sola. */
  kernel:()=>Promise<KernelTextHelpers>;
  /** Assente = nessun broker consultato, comportamento di ripiego puro. */
  broker?:ExecutionBroker|undefined;
  platform?:NodeJS.Platform|undefined;
  network?:ExecutionRequest['network']|undefined;
  requiredEnforcement?:EnforcementLevel|undefined;
  /**
   * Strict switch (gate E7, Claude Code `sandbox.failIfUnavailable`): when true, any path that cannot prove the
   * requested isolation is refused rather than executed by the kernel fallback. When false and `requiredEnforcement`
   * is `windows-sandbox` — the product since R0 (owner decision 1) — such a command runs on the host and its row says
   * `⛶ host · not isolated` and why.
   */
  requireVerifiedIsolation?:boolean|undefined;
  timeoutMs?:number|undefined;
  shellExecutable?:string|undefined;
  newId?:(()=>string)|undefined;
  /**
   * R5a lane R, S6 (owner decision Q-R5-10, gate E6): keeps a cut command's FULL output (output-store.ts) and returns where,
   * or null. When given, a cut output tells the model in English how much was cut and which file holds the rest; absent, the
   * kernel's own cut and Italian marker, as before.
   */
  keepFullOutput?:((text:string)=>Promise<SavedToolOutput|null>)|undefined;
  /**
   * F-E-001 (owner 11/10/2026): the realpath preload for the person's Node programs inside the sandbox (sandbox-node-realpath.ts).
   * Given, a sandboxed command gets `NODE_OPTIONS=--require "<file>"` beside the allowlisted environment, and the file's folder
   * read-only; absent, the request is exactly as before.
   */
  sandboxNodePreload?:string|null|undefined;
};
/** The most of a fallback command's streamed output kept for its file (the kernel itself holds 160,000 characters). */
const CAPTURE_MAX=8_000_000;
/*
 * 14/10/2026 (owner: «Aggiungo il sottofondo, poi la sveglia»). How long a command moved to the background may live in the
 * sandbox before the broker ends it: the kernel's host path sets no limit at all; the broker's request needs one, so a long one
 * (a dev server for a working day), and the row's Stop ends it any time before.
 */
export const BACKGROUND_LIFETIME_MS=12*60*60*1000;
/* The kernel's contract (talosHarness.mjs `testoSfondo`, INTESTAZIONE_SFONDO): the registry reads `IN BACKGROUND` at the start
   of the answer to mark the row; the rest in the kernel's words, plus what the broker cannot do (no streaming). */
function backgroundText(da:'avvio'|'tempo-scaduto'|'persona',file:string|null,waitedMs:number):string{
  const seconds=Math.max(1,Math.round(waitedMs/1000));
  const who=da==='persona'?'moved to the background by the person (Processes tab)'
    :da==='tempo-scaduto'?`timed out after ${seconds} s and was moved to the background instead of being killed`
    :'started in the background on request';
  const where=file?`Output file: ${file}`:'(No output file: the folder refused the write; the output is not collected any more.)';
  return`IN BACKGROUND: ${who}. ⏳ The command keeps running in the background (it was NOT killed). It runs isolated, and the isolation hands its output over when the command ends: the output file above receives it then, and you are told when it ends.\n${where}`;
}
async function appendToFile(file:string,text:string):Promise<boolean>{
  try{await mkdir(path.dirname(file),{recursive:true});await appendFile(file,text,'utf8');return true;}catch{return false;}
}

function isolationForKernelEnforcement(value:string):string{
  if(value==='wsl2')return EXECUTION_TEXT.isolation.wsl2;
  if(value==='adb-shell-on-device')return EXECUTION_TEXT.isolation.device;
  if(value==='none'||!value)return EXECUTION_TEXT.isolation.host;
  return EXECUTION_TEXT.isolation.other(value);
}
function annotate(isolation:string,reason:string):string{return `${isolation} — ${reason}`;}

export function createBrokeredKernelExecutor(options:BrokeredKernelExecutorOptions):KernelExecutor{
  const platform=options.platform??process.platform;
  /*
   * ⛔ LA RETE SEGUE IL MOTORE DEI PERMESSI, non una costante inventata qui. Il motore di oggi
   *   (`cli/src/security/permission-engine.ts`) non ha ancora una regola che parli della rete di un
   *   sottoprocesso: `WebFetch` riguarda le richieste del MODELLO, non quelle che un comando apre
   *   per conto suo. ⇒ Il default e' il valore che CONSERVA il comportamento di oggi (il kernel
   *   esegue senza alcun confine di rete), e il buco e' dichiarato nel rapporto invece di essere
   *   colmato inventando un motore nuovo. Chi compone puo' gia' passare `network` quando il motore
   *   imparera' a decidere deny/ask/allow.
   */
  const network=options.network??'internet-client';
  /*
   * ⛔ `restricted-process` e non `windows-sandbox`: con `windows-sandbox` il broker LANCIA
   *   `SANDBOX_REQUIRED_UNAVAILABLE` (execution-broker.ts L85) invece di declinare, e un backend
   *   assente diventerebbe un errore duro invece del ripiego che lo scenario 2 pretende. Con
   *   `restricted-process` il broker prende comunque `windows-sandbox` se ce l'ha (L82-84) e
   *   declina con `EXECUTION_BACKEND_UNAVAILABLE` quando non ha niente (L87).
   */
  const requiredEnforcement=options.requiredEnforcement??'restricted-process';
  const requireVerifiedIsolation=options.requireVerifiedIsolation??false;
  /*
   * ⭐⭐⭐ R0 lane S — THE DECLARED HOST FALLBACK (owner decision 1, 2026-09-23; review D-01/E-01).
   * F16 (`dd9620d9b`) made the product refuse every command whose isolation could not be proven, and on a host where
   * the probe itself was broken that meant NO command ran at all. The product still ASKS for the Windows sandbox
   * (`requiredEnforcement:'windows-sandbox'`, network denied), still never accepts a weaker sandbox in its place, and
   * still lets a sandbox that exists and fails propagate (below). What changes: when no verified sandbox exists, the
   * command runs through the kernel's own executor on the host, and the row says so — `⛶ host · not isolated` and
   * the backend's own reason. Claude Code does the same by default ("shows a warning and runs commands without
   * sandboxing", code.claude.com/docs/en/sandboxing, v2.1.271, 2026-09-14); the approval before it is the permission
   * engine's (gate §0.2 rule 2).
   */
  const declaredHost=!requireVerifiedIsolation&&requiredEnforcement==='windows-sandbox';
  const timeoutMs=options.timeoutMs??120_000;
  const newId=options.newId??(():string=>randomUUID());
  let loading:Promise<KernelTextHelpers>|null=null;
  const loadKernel=():Promise<KernelTextHelpers>=>(loading??=options.kernel());

  /*
   * ⛔ CHI NON PUO' ANDARE NEL BROKER, E PERCHE'. Un AppContainer non puo' ospitare una `adb shell`
   *   ne' una distribuzione WSL2: mandarceli sarebbe la cura di una malattia che non esiste, e
   *   cambierebbe in silenzio DOVE gira il comando — esattamente il difetto che D-10F ha chiuso.
   */
  function declineReason(opts:KernelExecutorOptions):string|null{
    if(opts.mobile===true)return EXECUTION_TEXT.reason.destinationMobile;
    if(opts.dove==='wsl2')return EXECUTION_TEXT.reason.destinationWsl2;
    if(platform!=='win32')return declaredHost?EXECUTION_TEXT.reason.hostPlatform(String(platform)):EXECUTION_TEXT.reason.platformNotWindows(String(platform));
    if(!options.broker)return declaredHost?EXECUTION_TEXT.reason.hostNoBroker:EXECUTION_TEXT.reason.brokerNotConfigured;
    return null;
  }

  async function fallback(helpers:KernelTextHelpers,comando:string,cartella:string,opts:KernelExecutorOptions,reason:string):Promise<KernelExecutorResult>{
    /*
     * R5a lane R, S6: the kernel's executor cuts its output itself (`uscitaUtile`) and returns only the cut; every piece it
     * reads is also handed to `onPezzo` as it arrives (talosHarness.mjs `eseguiComandoSandboxato`, D-10B). The pieces are
     * kept here, in arrival order, so a cut output can still be saved whole; the caller's listener still gets every piece.
     */
    const keep=options.keepFullOutput;
    let captured='';let capturedAll=true;
    const listener=opts.onPezzo;
    const withCapture:KernelExecutorOptions=keep?{...opts,onPezzo:(piece)=>{
      if(captured.length<CAPTURE_MAX)captured+=piece.testo;else capturedAll=false;
      listener?.(piece);
    }}:opts;
    const kernelResult=await helpers.eseguiComandoSandboxato(comando,cartella,withCapture);
    let result=kernelResult;
    if(keep&&hasKernelCutMarker(String(kernelResult.testo??''))){
      const full=capturedAll?captured:captured.slice(0,CAPTURE_MAX);
      let saved:SavedToolOutput|null=null;try{saved=full?await keep(full):null;}catch{saved=null;}
      result={...kernelResult,testo:replaceKernelCutMarker(String(kernelResult.testo),saved)};
    }
    const kernelEnforcement=String(result.enforcement??'');
    /* ⛔ Only a plain host run takes the declared label: WSL2 and the device keep naming where they ran. */
    const isolation=declaredHost&&(kernelEnforcement==='none'||!kernelEnforcement)?EXECUTION_TEXT.isolation.hostNotIsolated:isolationForKernelEnforcement(kernelEnforcement);
    return{...result,enforcement:annotate(isolation,reason)};
  }

  /* R5a lane R, S6: the same head and tail as the kernel's cut, and with `keepFullOutput` the English marker naming the file. */
  async function cutOutput(helpers:KernelTextHelpers,full:string):Promise<string>{
    const keep=options.keepFullOutput;
    if(!keep)return helpers.uscitaUtile(full,4_000,0.25);
    if(full.length<=TOOL_OUTPUT_LIMIT)return full;
    let saved:SavedToolOutput|null=null;try{saved=await keep(full);}catch{saved=null;}
    return cutToolOutput(full,saved);
  }

  return async function brokeredKernelExecutor(comando:string,cartella:string,given:KernelExecutorOptions={}):Promise<KernelExecutorResult>{
    const helpers=await loadKernel();
    /* a read-only Git runs by itself, so it must not run what the folder's configuration says */
    const safe=given.mobile===true||given.dove==='wsl2'?{}:await safeGitEnvironment(comando,cartella);
    if(safe===null)return{codice:1,testo:t('screen.exec.gitUnknown'),enforcement:EXECUTION_TEXT.isolation.hostNotIsolated};
    const opts:KernelExecutorOptions=Object.keys(safe).length?{...given,aggiunteAmbiente:safe}:given;
    const declined=declineReason(opts);
    if(declined!==null){
      if(requireVerifiedIsolation){
        let why=t('screen.exec.why.unverified');
        if(opts.mobile===true)why=t('screen.exec.why.mobile');
        else if(opts.dove==='wsl2')why=t('screen.exec.why.wsl2');
        else if(platform!=='win32')why=t('screen.exec.why.platform',{platform:String(platform)});
        else if(!options.broker)why=t('screen.exec.why.noBroker');
        throw new TalosError({
          code:'SANDBOX_REQUIRED_UNAVAILABLE',
          component:'execution-broker',
          retryable:false,
          hint:t('screen.exec.why.notRun',{why}),
          traceId:newId(),
        });
      }
      return fallback(helpers,comando,cartella,opts,declined);
    }
    const broker=options.broker!;
    /*
     * 14/10/2026 (owner, background like Claude Code; the kernel's rule, `creaGestoreSfondo`): with the row's «to the background»
     * control the call's time MOVES the command to the background instead of killing it, `background:true` starts it there, and
     * the control moves it on request; without the control (a caller with no row) the time kills it, as before. The call's time
     * is the model's `timeout` the kernel passes (it was always 120 s here).
     */
    const canBackground=Boolean(opts.segnaleSfondo);
    const foregroundMs=typeof opts.timeoutMs==='number'&&Number.isFinite(opts.timeoutMs)&&opts.timeoutMs>0?opts.timeoutMs:timeoutMs;
    /*
     * ⛔ Round 5: nessuna coda, nemmeno con `tracciaCartella`. Vedi il blocco in testa al file.
     *
     * ⛔ Invocazione NON INTERATTIVA, identica a quella che Node stesso costruisce per
     *   `spawn(comando,{shell:true})` su Windows: `%ComSpec% /d /s /c <comando>`. `/d` spegne gli
     *   AutoRun del registro, che dentro un isolamento sarebbero un ingresso non dichiarato.
     * ⛔ La RADICE DEL VOLUME in sola lettura e' OBBLIGATORIA, non una comodita': upstream
     *   microsoft/mxc#1109 (SDK 0.8.0) dimostra che una concessione in scrittura su una cartella di
     *   profilo utente e' inutilizzabile se la radice del volume non sta anche fra le sole letture.
     */
    const request:ExecutionRequest={
      id:newId(),
      executable:options.shellExecutable??process.env['ComSpec']??'cmd.exe',
      args:['/d','/s','/c',comando],
      cwd:cartella,
      readWritePaths:[cartella],
      readOnlyPaths:[path.parse(path.resolve(cartella)).root,...(options.sandboxNodePreload?[path.dirname(options.sandboxNodePreload)]:[])],
      ...(options.sandboxNodePreload||opts.aggiunteAmbiente?{environment:{...mxcChildEnvironment(),...(options.sandboxNodePreload?{NODE_OPTIONS:sandboxNodeOptions(options.sandboxNodePreload)}:{}),...opts.aggiunteAmbiente}}:{}),
      network:opts.rete===true?'internet-client':network,
      requiredEnforcement,
      timeoutMs:canBackground?BACKGROUND_LIFETIME_MS:foregroundMs,
      ...(opts.segnaleStop?{signal:opts.segnaleStop}:{}),
    };
    /*
     * ⛔⛔ I DUE FERMI DEL KERNEL NON SONO RIPRODUCIBILI ATTRAVERSO LA FORMA DEL BROKER: il contratto
     *   di risultato di un backend porta `exitCode/stdout/stderr/applied` e nient'altro, quindi
     *   «ucciso dal tempo» e «fermato da te» non tornano indietro. Si ricostruiscono QUI, con gli
     *   stessi codici (124 / 130) e le stesse marche del kernel. Dichiarato, non nascosto.
     */
    const work=broker.execute(request).then(
      (value)=>({kind:'ok' as const,value}),
      (error:unknown)=>({kind:'error' as const,error}),
    );
    let timer:ReturnType<typeof setTimeout>|undefined;
    const expired=new Promise<{kind:'timeout'}>((resolve)=>{timer=setTimeout(()=>resolve({kind:'timeout'}),foregroundMs);});
    const stopped=new Promise<{kind:'stopped'}>((resolve)=>{
      const signal=opts.segnaleStop;
      if(!signal)return;
      if(signal.aborted){resolve({kind:'stopped'});return;}
      signal.addEventListener('abort',()=>resolve({kind:'stopped'}),{once:true});
    });
    const moved=new Promise<{kind:'background';da:'avvio'|'persona'}>((resolve)=>{
      if(!canBackground)return;
      if(opts.inSfondoSubito===true){resolve({kind:'background',da:'avvio'});return;}
      const signal=opts.segnaleSfondo!;
      if(signal.aborted){resolve({kind:'background',da:'persona'});return;}
      signal.addEventListener('abort',()=>resolve({kind:'background',da:'persona'}),{once:true});
    });
    let outcome:{kind:'ok';value:Awaited<ReturnType<ExecutionBroker['execute']>>}|{kind:'error';error:unknown}|{kind:'timeout'}|{kind:'stopped'}|{kind:'background';da:'avvio'|'persona'};
    try{outcome=await Promise.race([work,expired,stopped,moved]);}finally{if(timer)clearTimeout(timer);}

    if(canBackground&&(outcome.kind==='background'||outcome.kind==='timeout')){
      /* the answer now; the command keeps running in the sandbox; its exit (and its output, which the broker gives only at the end)
         reach the file and `uscita` — the registry wakes the conversation with it */
      const da=outcome.kind==='timeout'?'tempo-scaduto' as const:outcome.da;
      const file=typeof opts.fileSfondo==='string'&&opts.fileSfondo?opts.fileSfondo:null;
      const ready=file?appendToFile(file,''):Promise.resolve(false);
      const uscita:Promise<BackgroundExit>=work.then(async(end)=>{
        if(end.kind==='ok'){
          const {exitCode,stdout,stderr}=end.value as {exitCode:number;stdout:string;stderr:string};
          if(file&&await ready)await appendToFile(file,[String(stdout??''),String(stderr??'')].filter(Boolean).join('\n'));
          return{codice:exitCode,segnale:null};
        }
        /* review of 0.6.4 (S3): a command the sandbox stopped (its Stop, more than 8 MB of output, the 12 hours) keeps what it wrote
           until then, and the file says why it ended */
        const failure=(end as {error?:any}).error;const source=failure?.stdout!==undefined||failure?.stderr!==undefined?failure:failure?.cause;
        const sofar=[String(source?.stdout??''),String(source?.stderr??'')].filter(Boolean).join('\n');
        const stopped=opts.segnaleStop?.aborted===true;
        const code=String(source?.message??failure?.code??'');
        const why=stopped?'it was stopped on request'
          :/OUTPUT_LIMIT/u.test(code)?'it wrote more than 8 MB, and the sandbox stops a command there'
          :/TIMEOUT/u.test(code)?'it ran for 12 hours, the most a command in the background may run'
          :'the sandbox ended it';
        if(file&&await ready)await appendToFile(file,`${sofar?`${sofar}\n`:''}[TALOS: the command ended early: ${why}.]`);
        /* the row's Stop aborts the broker's request: the same code the kernel gives a stop (130) */
        if(stopped)return{codice:KERNEL_EXIT.stoppedOnRequest,segnale:null};
        return{codice:null,segnale:null,errore:true};
      });
      return{codice:null,messoInSfondo:true,daSfondo:da,fileSfondo:(await ready)?file:null,parziale:'',uscita,
        testo:backgroundText(da,(await ready)?file:null,foregroundMs),
        enforcement:annotate(EXECUTION_TEXT.isolation.sandboxWithoutEvidence,EXECUTION_TEXT.reason.movedToBackground),
        cartellaFinale:null};
    }
    if(outcome.kind==='background')throw new Error('unreachable: a background outcome without the row\'s control');

    if(outcome.kind==='timeout')return{
      codice:KERNEL_EXIT.timeout,
      fermatoDalTempo:true,
      testo:`\n\n${EXECUTION_TEXT.marker.timedOut(timeoutMs)}`.trim(),
      enforcement:annotate(EXECUTION_TEXT.isolation.sandboxWithoutEvidence,EXECUTION_TEXT.reason.timedOut(timeoutMs)),
      cartellaFinale:null,
    };
    if(outcome.kind==='stopped')return{
      codice:KERNEL_EXIT.stoppedOnRequest,
      fermatoSuRichiesta:true,
      testo:`\n\n${EXECUTION_TEXT.marker.stoppedOnRequest} ${EXECUTION_TEXT.marker.stoppedOnRequestSentence}`.trim(),
      enforcement:annotate(EXECUTION_TEXT.isolation.sandboxWithoutEvidence,EXECUTION_TEXT.reason.stoppedOnRequest),
      cartellaFinale:null,
    };
    if(outcome.kind==='error'){
      const failure=outcome.error as {code?:string;hint?:string;message?:string};
      /*
       * ⛔⛔⛔ UN SOLO ERRORE E' CONDIZIONE DI RIPIEGO: «non esiste nessun backend». Tutto il resto —
       *   e in particolare `SANDBOX_EVIDENCE_MISMATCH` — RISALE. Una sandbox che esiste e ha
       *   RIFIUTATO non si aggira in silenzio: sarebbe la peggiore delle bugie, perche' il comando
       *   girerebbe fuori dall'isolamento proprio nel caso in cui l'isolamento aveva qualcosa da dire.
       */
      /* ⛔ Il broker non si e' potuto COSTRUIRE: nessun isolamento esiste, quindi si esegue fuori, e
         la riga dice perche' con il codice dell'errore — mai «non configurato in questa build». */
      if(failure?.code===BROKER_CONSTRUCTION_FAILED){
        if(requireVerifiedIsolation)throw outcome.error;
        const detail=failure.hint??t('screen.exec.why.noDetail');
        return fallback(helpers,comando,cartella,opts,declaredHost?EXECUTION_TEXT.reason.brokerUnbuildable(detail):EXECUTION_TEXT.reason.brokerConstructionFailed(detail));
      }
      /*
       * ⛔ R0 lane S: `SANDBOX_REQUIRED_UNAVAILABLE` from the BROKER is the same fact as EXECUTION_BACKEND_UNAVAILABLE —
       *   no verified backend exists — for a request that required the Windows sandbox (execution-broker.ts). Its
       *   cause carries the backend's own reason (for example the probe's). Everything else still propagates:
       *   EXECUTION_BACKEND_FAILED, SANDBOX_EVIDENCE_MISMATCH, SANDBOX_PATH_INVALID, SANDBOX_CWD_NOT_GRANTED.
       */
      if(declaredHost&&failure?.code==='SANDBOX_REQUIRED_UNAVAILABLE'){
        const cause=(outcome.error as {cause?:unknown})?.cause;
        const why=cause instanceof Error&&cause.message?cause.message:failure.hint??t('screen.exec.why.noBackend');
        return fallback(helpers,comando,cartella,opts,EXECUTION_TEXT.reason.sandboxUnverified(why));
      }
      if(failure?.code!=='EXECUTION_BACKEND_UNAVAILABLE')throw outcome.error;
      if(requireVerifiedIsolation)throw outcome.error;
      const why=failure.hint??failure.message??t('screen.exec.why.noEnforcement');
      return fallback(helpers,comando,cartella,opts,declaredHost?EXECUTION_TEXT.reason.sandboxUnverified(why):EXECUTION_TEXT.reason.backendUnavailable(why));
    }

    const {exitCode,stdout,stderr,evidence}=outcome.value as {exitCode:number;stdout:string;stderr:string;evidence:ExecutionEvidence};
    /*
     * ⛔ Round 5: nessuna coda, quindi niente da staccare. Stdout e stderr arrivano come il comando li ha
     *   scritti — anche se contengono qualcosa che somiglia a un marcatore: e' uscita del comando.
     * ⛔ Round 2, ancora vero: stderr non si perde mai, e non si unisce a stdout prima di un taglio.
     */
    const out=String(stdout??'').replace(/[\r\n]+$/u,'');
    const err=String(stderr??'').replace(/[\r\n]+$/u,'');
    /*
     * ⛔ DEBITO B1.10, DICHIARATO: sul ramo brokerato l'uscita dal vivo NON esiste — il contratto di
     *   risultato del backend non ha un canale di streaming. Si emette il testo intero UNA volta
     *   prima di tornare, cosi' chi ascolta vede qualcosa; il ramo di ripiego continua a trasmettere
     *   a pezzi come sempre.
     * ⛔ E per la stessa ragione l'ORDINE fra i due flussi non esiste qui: prima stdout, poi stderr.
     *   Il ripiego del kernel li intreccia nell'ordine d'arrivo; questo contratto non lo permette.
     */
    if(out)opts.onPezzo?.({flusso:'fuori',testo:out});
    if(err)opts.onPezzo?.({flusso:'errori',testo:out?`\n${err}`:err});
    return{
      /* ⛔ Lo stato d'uscita del PROCESSO `cmd /d /s /c <comando>`, lo stesso di `cmd /c` semplice. Mai un
         numero letto dal testo. */
      codice:exitCode,
      /* ⛔ Il taglio e' quello del KERNEL, non una seconda regola: persona e modello devono leggere
         lo stesso testo sotto lo stesso nome. */
      testo:await cutOutput(helpers,`${out}\n${err}`.trim()),
      enforcement:annotate(EXECUTION_TEXT.isolation.sandbox(evidence.backend),EXECUTION_TEXT.reason.verified(evidence)),
      /* ⛔ Nessuna coda, nessuna cartella finale: il registro tiene quella di prima. */
      cartellaFinale:null,
    };
  };
}
