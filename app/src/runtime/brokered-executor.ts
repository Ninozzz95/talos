import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {TalosError} from '../errors.ts';
import type {EnforcementLevel,ExecutionBroker,ExecutionEvidence,ExecutionRequest} from '../security/execution-broker.ts';

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
 * ⭐⭐⭐ IL DIZIONARIO — un posto solo per ogni parola che finisce sotto gli occhi di una persona.
 *
 * Il CLI parte in inglese con UN dizionario, cosi' l'italiano si potra' aggiungere senza riaprire
 * il codice. ⛔ Nessuna di queste stringhe si scrive altrove: se si sparpagliano, la prossima
 * traduzione ne perde qualcuna in silenzio.
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
    sandbox:(backend:string)=>`⛉ sandbox (${backend})`,
    /** Il giro isolato e' finito prima di dire come: non si promette un isolamento che non e' provato. */
    sandboxWithoutEvidence:'⛉ sandbox (no evidence reported)',
    host:'⛶ host',
    wsl2:'⛶ wsl2',
    device:'⛶ device',
    other:(name:string)=>`⛶ ${name}`,
  },
  reason:{
    verified:(evidence:{appContainer:boolean;filesystem:string;network:string;processTree:string})=>`typed by you; isolation verified: AppContainer ${evidence.appContainer?'on':'off'}, filesystem ${evidence.filesystem}, network ${evidence.network}, process tree ${evidence.processTree}`,
    backendUnavailable:(why:string)=>`typed by you; no isolation backend on this host: ${why}`,
    brokerNotConfigured:'typed by you; no isolation broker is configured in this build, so the command ran outside the isolation',
    /** The broker exists in this build but could not be BUILT: never the same sentence as «not configured». */
    brokerConstructionFailed:(detail:string)=>`typed by you; the isolation broker could not be built (${detail}), so the command ran outside the isolation`,
    destinationMobile:'typed by you; an AppContainer cannot host an adb shell, so the command ran on the device',
    destinationWsl2:'typed by you; an AppContainer cannot host a WSL2 distribution, so the command ran in WSL2',
    platformNotWindows:(platform:string)=>`typed by you; the isolation backend is Windows-only and this host is ${platform}`,
    timedOut:(ms:number)=>`typed by you; the isolated run did not finish within ${Math.round(ms/1_000)}s and was stopped`,
    stoppedOnRequest:'typed by you; you stopped the isolated run before it finished',
  },
  /*
   * ⛔ Le tre marche del kernel, riprodotte LETTERA PER LETTERA perche' il kernel non le esporta
   *   (`MARCA_FERMATO_MENTRE_GIRAVA` e `USCITA_FERMATO_SU_RICHIESTA` sono `const` di modulo, non
   *   `export`). Una prova legge il sorgente del kernel e verifica che siano ancora identiche: e'
   *   l'unico modo per accorgersi di una deriva, visto che la copia e' inevitabile.
   */
  marker:{
    stoppedOnRequest:'⛔ Fermato su richiesta:',
    stoppedOnRequestSentence:'il comando e stato interrotto mentre girava.',
    timedOut:(ms:number)=>`⛔ Fermato allo scadere dei ${Math.round(ms/1_000)} secondi: non ha finito da solo.`,
  },
  /** ⛔ Un comando senza sessione si RIFIUTA a voce alta: farlo sparire e' peggio che negarlo. */
  shellSessionRequired:'Start a session before running a command with !',
} as const;

export type KernelExecutorOptions={mobile?:boolean;onPezzo?:(piece:{flusso:'fuori'|'errori';testo:string})=>void;tracciaCartella?:boolean;dove?:string|null;segnaleStop?:AbortSignal};
export type KernelExecutorResult={codice:number;testo:string;enforcement:string;cartellaFinale?:string|null;fermatoDalTempo?:boolean;fermatoSuRichiesta?:boolean};
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
  /** Product policy: when true, any path that cannot prove the requested isolation is refused rather than executed by the kernel fallback. */
  requireVerifiedIsolation?:boolean|undefined;
  timeoutMs?:number|undefined;
  shellExecutable?:string|undefined;
  newId?:(()=>string)|undefined;
};

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
    if(platform!=='win32')return EXECUTION_TEXT.reason.platformNotWindows(String(platform));
    if(!options.broker)return EXECUTION_TEXT.reason.brokerNotConfigured;
    return null;
  }

  async function fallback(helpers:KernelTextHelpers,comando:string,cartella:string,opts:KernelExecutorOptions,reason:string):Promise<KernelExecutorResult>{
    const result=await helpers.eseguiComandoSandboxato(comando,cartella,opts);
    return{...result,enforcement:annotate(isolationForKernelEnforcement(String(result.enforcement??'')),reason)};
  }

  return async function brokeredKernelExecutor(comando:string,cartella:string,opts:KernelExecutorOptions={}):Promise<KernelExecutorResult>{
    const helpers=await loadKernel();
    const declined=declineReason(opts);
    if(declined!==null){
      if(requireVerifiedIsolation){
        let why='verified Windows sandbox isolation is unavailable';
        if(opts.mobile===true)why='mobile execution is outside the Windows AppContainer boundary';
        else if(opts.dove==='wsl2')why='WSL2 execution is outside the Windows AppContainer boundary';
        else if(platform!=='win32')why=`TALOS CLI v1 sandboxing requires Windows x64; this host is ${String(platform)}`;
        else if(!options.broker)why='no CLI isolation broker is configured';
        throw new TalosError({
          code:'SANDBOX_REQUIRED_UNAVAILABLE',
          component:'execution-broker',
          retryable:false,
          hint:`${why}; the command was not run`,
          traceId:newId(),
        });
      }
      return fallback(helpers,comando,cartella,opts,declined);
    }
    const broker=options.broker!;
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
      readOnlyPaths:[path.parse(path.resolve(cartella)).root],
      network,
      requiredEnforcement,
      timeoutMs,
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
    const expired=new Promise<{kind:'timeout'}>((resolve)=>{timer=setTimeout(()=>resolve({kind:'timeout'}),timeoutMs);});
    const stopped=new Promise<{kind:'stopped'}>((resolve)=>{
      const signal=opts.segnaleStop;
      if(!signal)return;
      if(signal.aborted){resolve({kind:'stopped'});return;}
      signal.addEventListener('abort',()=>resolve({kind:'stopped'}),{once:true});
    });
    let outcome:{kind:'ok';value:Awaited<ReturnType<ExecutionBroker['execute']>>}|{kind:'error';error:unknown}|{kind:'timeout'}|{kind:'stopped'};
    try{outcome=await Promise.race([work,expired,stopped]);}finally{if(timer)clearTimeout(timer);}

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
        return fallback(helpers,comando,cartella,opts,EXECUTION_TEXT.reason.brokerConstructionFailed(failure.hint??'no detail'));
      }
      if(failure?.code!=='EXECUTION_BACKEND_UNAVAILABLE')throw outcome.error;
      if(requireVerifiedIsolation)throw outcome.error;
      const why=failure.hint??failure.message??'no execution backend satisfies the requested enforcement';
      return fallback(helpers,comando,cartella,opts,EXECUTION_TEXT.reason.backendUnavailable(why));
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
      testo:helpers.uscitaUtile(`${out}\n${err}`.trim(),4_000,0.25),
      enforcement:annotate(EXECUTION_TEXT.isolation.sandbox(evidence.backend),EXECUTION_TEXT.reason.verified(evidence)),
      /* ⛔ Nessuna coda, nessuna cartella finale: il registro tiene quella di prima. */
      cartellaFinale:null,
    };
  };
}
