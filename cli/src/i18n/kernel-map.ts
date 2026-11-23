/*
 * R2 lane E (gate E4, E5, E15): the kernel's identifiers → the CLI's English. The kernel is not edited in R2 (Q-R2-8), and it
 * speaks Italian; what crosses into the CLI and is stable is mapped here and nowhere else.
 *
 * ⛔ Two exact-text tables exist because the kernel DROPS the structured fields at the RunError boundary: the public
 *   provider error carries `classe`/`stato` (`runtime-owner-adapter.mjs:717-727`), but `agent-service.mjs:1991` forwards only
 *   `{message, code}`, so the CLI sees `PROVIDER_REQUEST_ERROR` plus one of eight fixed sentences. Those sentences are kernel
 *   CONSTANTS, compared whole (never searched for a word), and `test/i18n/errors-view.test.ts` pins every one of them
 *   against the kernel source, as `brokered-executor.ts` pins its three markers: a reworded kernel turns the test red
 *   instead of silently falling back to the generic words.
 */

import {t,tn,type MessageId,type PluralId} from './index.ts';
export type ProviderClass='rate-limited'|'credential'|'credit'|'network'|'timeout'|'server-error'|'stream-cut'|'not-accepted'|'context';

/** `erroreFornitorePubblico` (runtime-owner-adapter.mjs:718-725): the eight public sentences and the class each one names. */
export const KERNEL_PROVIDER_MESSAGES:Readonly<Record<string,ProviderClass>>=Object.freeze({
  'Troppo traffico presso il fornitore.':'rate-limited',
  'Credenziale rifiutata dal fornitore.':'credential',
  'Credito non disponibile presso il fornitore.':'credit',
  'Connessione con il fornitore interrotta.':'network',
  'Il fornitore ha superato il tempo massimo.':'timeout',
  'Il fornitore non risponde.':'server-error',
  'La risposta del fornitore si è interrotta.':'stream-cut',
  'Il fornitore non ha accettato la richiesta.':'not-accepted',
  /* K3 (desktop, 03/10: the kernel's text in English; whoever READS accepts both forms for good): the same eight, as
     erroreFornitorePubblico writes them after K3 (branch i18n/k3, runtime-owner-adapter.mjs:960) */
  'Too much traffic at the provider.':'rate-limited',
  'Credential rejected by the provider.':'credential',
  'Credit not available at the provider.':'credit',
  'Connection with the provider interrupted.':'network',
  'The provider exceeded the maximum time.':'timeout',
  'The provider is not responding.':'server-error',
  'The provider response was cut off.':'stream-cut',
  'The provider did not accept the request.':'not-accepted',
});

/** The kernel's `classe` values (research-orchestrator.mjs `classificaErroreDiCorsa`), for errors that still carry them. */
export const KERNEL_CLASSES:Readonly<Record<string,ProviderClass>>=Object.freeze({
  traffico:'rate-limited',credenziale:'credential',credito:'credit',rete:'network','timeout-fornitore':'timeout',
  'guasto-fornitore':'server-error','flusso-interrotto':'stream-cut','richiesta-non-valida':'not-accepted',contesto:'context',ignoto:'not-accepted',
  /* 0.6.11 (r4): a retired model; its own code (PROVIDER_MODEL_UNAVAILABLE) gives the words, the class reads as not accepted */
  'modello-non-disponibile':'not-accepted',
});

/** Transport codes the kernel names itself (runtime-owner-adapter.mjs:769-774, :705) and Node's undici codes. */
export const TRANSPORT_CODES:Readonly<Record<string,ProviderClass>>=Object.freeze({
  PROVIDER_NETWORK_ERROR:'network',PROVIDER_SILENCE:'network',UND_ERR_BODY_TIMEOUT:'network',UND_ERR_SOCKET:'network',
  ECONNRESET:'network',ECONNREFUSED:'network',ENOTFOUND:'network',EAI_AGAIN:'network',
  PROVIDER_FIRST_RESPONSE_TIMEOUT:'timeout',UND_ERR_HEADERS_TIMEOUT:'timeout',UND_ERR_CONNECT_TIMEOUT:'timeout',
});

/** RunError codes that are task OUTCOMES (agent-service.mjs:160-185), not service failures. */
export const RUN_OUTCOMES=Object.freeze({fermato:'stopped','giri-esauriti':'turns-exhausted',ripetizione:'repetition','premesse-negate':'premise-denied','tetto-uscita':'output-limit','rifiuto-del-modello':'model-refused'} as const);
/* F-L-001 (stress-test smoke of rc.1, 08/10/2026): the kernel's provider values (provider-registry.mjs `esecuzione`, `AUTH`) as the
   printed profile of `talos provider list` says them. The kernel keeps its words (the TUI compares them); an unknown value passes through. */
export const PROVIDER_EXECUTION_VALUES:Readonly<Record<string,string>>=Object.freeze({collegato:'connected','da configurare':'needs-setup',configurato:'configured','runtime locale':'local-runtime','motore locale':'local-engine'});
export const PROVIDER_AUTH_TYPES:Readonly<Record<string,string>>=Object.freeze({effimera:'ephemeral'});
export type RunOutcome=typeof RUN_OUTCOMES[keyof typeof RUN_OUTCOMES];
/** The kernel's lowercase outcome codes are Italian words; the screen shows these English codes instead (D-05). The JSON
 *  envelope keeps the kernel's code unchanged (v1 frozen, gate E11). */
export const DISPLAY_CODES:Readonly<Record<string,string>>=Object.freeze({
  fermato:'INTERRUPTED','giri-esauriti':'TURNS_EXHAUSTED',ripetizione:'REPEATED_TOOL_CALL','premesse-negate':'PREMISE_DENIED','tetto-uscita':'OUTPUT_LIMIT','rifiuto-del-modello':'MODEL_REFUSED','internal-error':'INTERNAL_ERROR',
  /* Kernel codes spelled in Italian (plugin-registry.mjs:460-665, http-app.mjs:89-90): a code on screen is a word on screen. */
  PLUGIN_COMANDO_ESEGUE_CODICE:'PLUGIN_COMMAND_RUNS_CODE',PLUGIN_COMANDO_FUORI_DAL_PACCHETTO:'PLUGIN_COMMAND_OUTSIDE_PACKAGE',
  PLUGIN_COMANDO_NON_LEGGIBILE:'PLUGIN_COMMAND_UNREADABLE',PLUGIN_ID_AMBIGUO:'PLUGIN_ID_AMBIGUOUS',DOVE_NON_VALIDO:'LOCATION_INVALID',
  SCELTA_NON_VALIDA:'CHOICE_INVALID',
  /* 13/10/2026: one source of the list of models a sub-agent may be given did not answer in time (modelli-utilizzabili.mjs) */
  MODELLI_TEMPO:'MODEL_LIST_TIMEOUT',
  /* Core block 2 (decision 374, computer-use/file-approvati.mjs): the approved version was written back and the file read differently */
  NON_UGUALE:'FILE_CHANGED_AFTER_WRITE',
  /* Desktop phase B (87b81b202, «casa di esecuzione»): the Linux environment the file tools and the shell run in under WSL
     (kernel/casa-linux.mjs, talosHarness.mjs). */
  CASA_LINUX_AVVIO:'LINUX_HOME_START_FAILED',CASA_LINUX_CHIUSA:'LINUX_HOME_CLOSED',CASA_LINUX_ENV:'LINUX_HOME_ENVIRONMENT_MISSING',
  CASA_LINUX_IRRAGGIUNGIBILE:'LINUX_HOME_PATH_UNREACHABLE',CASA_LINUX_PERCORSO:'LINUX_HOME_PATH_NOT_ON_DRIVE',CASA_LINUX_USCITA:'LINUX_HOME_EXITED',
  /* r4 de8f33317 (13/10/2026): the ChatGPT plan's codes are spelled in Italian (chatgpt-accesso.mjs, chatgpt-richiesta.mjs). */
  CHATGPT_NON_COLLEGATO:'CHATGPT_NOT_CONNECTED',CHATGPT_PIANO_NON_ABILITATO:'CHATGPT_PLAN_NOT_ENABLED',CHATGPT_PIANO_NON_AMMESSO:'CHATGPT_PLAN_NOT_ALLOWED',CHATGPT_LIMITE_DEL_PIANO:'CHATGPT_PLAN_LIMIT',CHATGPT_ACCESSO_NON_VALIDO:'CHATGPT_SIGN_IN_INVALID',CHATGPT_RICHIESTA_INCOMPLETA:'CHATGPT_REQUEST_INCOMPLETE',CHATGPT_RICHIESTA_NON_AMMESSA:'CHATGPT_REQUEST_NOT_SUPPORTED',CHATGPT_SERVIZIO_NON_DISPONIBILE:'CHATGPT_SERVICE_UNAVAILABLE',
  /* «Continue with ChatGPT» in the CLI (13/10/2026): what a sign-in, a renewal and the model list can answer (chatgpt-accesso.mjs,
     chatgpt-oauth.mjs, chatgpt-custodia.mjs, chatgpt-rotte.mjs). */
  CHATGPT_NON_DISPONIBILE:'CHATGPT_UNAVAILABLE',CHATGPT_ACCESSO_SCADUTO:'CHATGPT_SIGN_IN_EXPIRED',CHATGPT_RINNOVO_FALLITO:'CHATGPT_RENEWAL_FAILED',CHATGPT_RETE:'CHATGPT_NETWORK',
  CHATGPT_CUSTODIA_FALLITA:'CHATGPT_STORE_FAILED',CHATGPT_CUSTODIA_ASSENTE:'CHATGPT_STORE_MISSING',CHATGPT_CUSTODIA_VOCE:'CHATGPT_STORE_ENTRY_INVALID',
  CHATGPT_RISPOSTA_INATTESA:'CHATGPT_UNEXPECTED_ANSWER',CHATGPT_ELENCO_NON_LETTO:'CHATGPT_MODEL_LIST_UNREADABLE',
  CHATGPT_ACCESSO_ANNULLATO:'CHATGPT_SIGN_IN_CANCELLED',/* r4 dbae665ea (e1ae22db8): the kernel's own word for an attempt nobody came back to in time */CHATGPT_TENTATIVO_SCADUTO:'CHATGPT_SIGN_IN_TIMEOUT',CHATGPT_ACCESSO_NEGATO:'CHATGPT_SIGN_IN_DENIED',CHATGPT_AUTORIZZAZIONE_RIFIUTATA:'CHATGPT_AUTHORIZATION_REFUSED',
  CHATGPT_ALTRO_ACCOUNT:'CHATGPT_OTHER_ACCOUNT',CHATGPT_CLIENT_DIVERSO:'CHATGPT_CLIENT_MISMATCH',CHATGPT_CLIENT_NON_VALIDO:'CHATGPT_CLIENT_INVALID',
  CHATGPT_CODICE_MANCANTE:'CHATGPT_CODE_MISSING',CHATGPT_ID_TOKEN_NON_VALIDO:'CHATGPT_IDENTITY_INVALID',CHATGPT_STATO_DIVERSO:'CHATGPT_STATE_MISMATCH',
  CHATGPT_SCAMBIO_RIFIUTATO:'CHATGPT_EXCHANGE_REFUSED',CHATGPT_RITORNO_SCONOSCIUTO:'CHATGPT_RETURN_UNKNOWN',CHATGPT_ERRORE:'CHATGPT_ERROR',
  CHATGPT_PORTA_NON_VALIDA:'CHATGPT_PORT_INVALID',CHATGPT_RICHIESTA_NON_VALIDA:'CHATGPT_REQUEST_INVALID',CHATGPT_ROTTA_SCONOSCIUTA:'CHATGPT_ROUTE_UNKNOWN',
});

/** Kernel run texts compared whole. `fermato` covers both the person's stop and a generation that stopped by itself
 *  (talosHarness.mjs:1472 vs :10207); only this constant tells the second apart. */
export const KERNEL_RUN_TEXT=Object.freeze({
  stoppedWithoutAnswer:'⛔ la generazione si e fermata senza risposta e senza esaurire i giri.',
  /* K3: the same sentence in English; both are read (isStoppedWithoutAnswer) */
  stoppedWithoutAnswerEn:'⛔ generation stopped without an answer and without exhausting the turns.',
});

/*
 * Kernel notices sent as a whole assistant chat message, not as an event with a code (`agent-service.mjs:1926-1930`
 * `onAvviso`, `:1938-1940` provider switch): `runtime-owner-adapter.mjs:857, 968-969`. Matched only as the WHOLE message
 * against the kernel template (anchored, the provider labels as the only variables), pinned by errors-view.test.ts; a
 * model's own answer in Italian never matches and is never rewritten.
 */
export const KERNEL_NOTICES:ReadonlyArray<{pattern:RegExp;id:'error.notice.keyRefused'|'error.notice.switchRateLimited'|'error.notice.switchNotAnswering'|'error.notice.zaiNoCredit';fragment?:string;legacy?:boolean}>=Object.freeze([
  /* 14/10/2026 (owner, CLI and desktop: the Z.AI key only to the chosen address): `zai-indirizzo.mjs` with `soloIndirizzo` says «no
     credit» and switches to nothing; the CLI adds how to choose the address. */
  {pattern:/^Z\.AI said there is no credit on (?<on>.+?)\. TALOS did not try another address with your key: choose the address you want for it\.$/u,id:'error.notice.zaiNoCredit',fragment:'TALOS did not try another address with your key: choose the address you want for it.'},
  /* K3/K4 (desktop, realigned 08/10/2026 to 156689e4e): the kernel writes the three notices in English (`runtime-owner-adapter.mjs` :1218, :1409-1410;
     the key notice also carries `testoChiave`/`testoParams`, which the chat message does not keep). Pinned against the kernel source. The Italian rows
     below stay only for sessions saved before K3 (no pin: the kernel no longer writes them). */
  {pattern:/^A (?<provider>.+?) key was rejected: check Providers and access\.$/u,id:'error.notice.keyRefused',fragment:'key was rejected: check Providers and access.'},
  {pattern:/^Provider (?<from>.+?) is limiting traffic: continuing with (?<to>.+?) · model (?<model>.+)$/u,id:'error.notice.switchRateLimited',fragment:' is limiting traffic: continuing with '},
  {pattern:/^Provider (?<from>.+?) is not responding: continuing with (?<to>.+?) · model (?<model>.+)$/u,id:'error.notice.switchNotAnswering',fragment:' is not responding: continuing with '},
  {pattern:/^Una chiave di (?<provider>.+?) è stata rifiutata: controlla Fornitori e accessi\.$/u,id:'error.notice.keyRefused',legacy:true},
  {pattern:/^Il fornitore (?<from>.+?) limita il traffico: continuo con (?<to>.+?) · modello (?<model>.+)$/u,id:'error.notice.switchRateLimited',legacy:true},
  {pattern:/^Il fornitore (?<from>.+?) non risponde: continuo con (?<to>.+?) · modello (?<model>.+)$/u,id:'error.notice.switchNotAnswering',legacy:true},
]);

/*
 * 0.6.15 (0614b stress F-L-001, contract R12): the permission `via` of a tool receipt, as `--protocol v2` and the screen say it.
 * Every value the kernel writes on a receipt (`esitoPermesso.via`, talosHarness.mjs `verificaPermesso*` and the asked ones of
 * `viaRichiesta`), pinned against the kernel source by test/protocol/v2-receipt-english.test.ts: a new kernel value turns that test
 * red instead of reaching v2 in Italian. The model, the kernel's own receipt and v1 keep the kernel's words.
 */
export const RECEIPT_VIA:Readonly<Record<string,string>>=Object.freeze({
  'nessun-vincolo':'unrestricted','permesso-per-attrezzo-sempre':'tool-always-allowed','permesso-per-attrezzo-chiedi':'tool-ask',
  'permesso-per-attrezzo-nega':'tool-off','livello-lettura':'level-read-only','livello-ricerca':'level-research',
  'livello-scrittura-area':'level-workspace-write','livello-su-richiesta':'level-ask','modalita-piano':'plan-mode',
  'credenziale-della-casa':'host-credential','fermato-su-richiesta':'stopped-on-request','floor-comando-senza-recupero':'unrecoverable-command',
  'pre-mutation-guard':'pre-mutation-guard','wsl-root':'wsl-root','segreto-forza-conferma':'secret-asks',
  'fuori-dal-progetto':'outside-project','contenuto-sospetto':'suspicious-content','attrezzo-sempre-da-confermare':'tool-always-asks',
  'trifecta-forza-conferma':'trifecta-asks',
  /* blocked folders step B (Desktop e33e35efe): a device's turn reaching a folder the person blocked for it — a hard deny, no card */
  'cartella-bloccata':'blocked-folder',
  /* r4 blocks 13-18: a shell wait the kernel stopped, and a command that would touch the person's own work */
  'attesa-fermata':'wait-stopped','lavoro-della-persona':'person-work',
  /* K1 (Desktop 6d9cf7be1): the early refusals, before the permission gate, now with their receipt */
  'percorso-nt':'nt-path','rete-senza-conferma':'network-unconfirmed','rete-negata':'network-denied','fermato-chiedendo':'stopped-while-asking',
  'rifiuto-anticipato':'early-refusal',
  /* Desktop fix/bloccate-casa-linux (27/10): three more early refusals of `scrivi`, with a denied receipt */
  'modalita-sconosciuta':'unknown-mode','testo-su-binario':'text-over-binary','sovrascrittura-non-letta':'unread-overwrite',
  /* D4 (owner 02/11), the research card: the person's yes on it (talosHarness.mjs `esitoDellaCarta`), and the two refusals before
     it — nobody in front, or a question empty or over the schema's cap (`ricerca-senza-persona`, `ricerca-senza-domanda`) */
  'carta-della-ricerca':'research-card','ricerca-senza-persona':'research-without-person','ricerca-senza-domanda':'research-without-question',
  /* E1 (candidate 7cf2811de, talosHarness.mjs `carta-emulata`): a tool call written as text asks on its own card; a no, or nobody to answer, refuses it */
  'carta-emulata':'emulated-card',
  /* 06/11 realignment (decision 155, kernel bb3c61b4d `viaRichiesta`): a critical deletion asks the person in every mode */
  'cancellazione-critica':'critical-delete',
  /* core of desktop 0.2.2 (talosHarness.mjs `cancelloDelloStrumentoDiFuori`): the person already said no to this same outside
     tool call in this turn, so it was refused without a second card */
  'no-della-persona-nel-giro':'person-declined-this-turn',
  /* core of desktop 0.2.3 (talosHarness.mjs `noAlloStrumentoDelGiro`): the person said no to this outside tool, whatever its
     arguments, until their next message, so it was refused without a card */
  'no-allo-strumento-nel-giro':'person-declined-tool-this-turn',
});
/** The receipt's `postcondizione` (talosHarness.mjs `postcondizioneDiScrivi`: retta/smentita/ignota, and `nessuna` when not checked). */
export const RECEIPT_POSTCONDITION:Readonly<Record<string,string>>=Object.freeze({retta:'held',smentita:'contradicted',ignota:'unknown',nessuna:'none'});
/** Who gave the yes an ancestor's rule covered (`consentitoDa.tipo`, talosHarness.mjs `origineDelConsenso` and the tool's «always»). */
export const RECEIPT_ALLOWED_BY_KIND:Readonly<Record<string,string>>=Object.freeze({cartella:'folder',percorso:'path',rete:'network',attrezzo:'tool'});

type RefusalKind='notApproved'|'toolOff'|'readOnly'|'research'|'workspaceWrite'|'stopped'|'noRecovery'|'checkpoint'|'blockedFolder'|'ntPath'|'networkUnconfirmed'|'networkDenied'|'hostCredential'|'unknownMode'|'textOverBinary'|'unreadOverwrite';
const REFUSAL_VIA_KERNEL:Readonly<Record<string,RefusalKind>>={
  'segreto-forza-conferma':'notApproved','attrezzo-sempre-da-confermare':'notApproved','trifecta-forza-conferma':'notApproved',
  'livello-su-richiesta':'notApproved','permesso-per-attrezzo-chiedi':'notApproved',
  /* core of desktop 0.2.2: the person's own no earlier in this turn, for the same outside tool call */
  'no-della-persona-nel-giro':'notApproved',
  /* core of desktop 0.2.3: the person said no to this outside tool on its card until their next message, any arguments */
  'no-allo-strumento-nel-giro':'notApproved',
  /* desktop F4-03 (75108d7ee): a write whose real path ends outside the session folder asks, whatever the level */
  'fuori-dal-progetto':'notApproved',
  /* decision 155: a critical deletion refused on its card is the person's no, like every other asked via */
  'cancellazione-critica':'notApproved',
  'permesso-per-attrezzo-nega':'toolOff','livello-lettura':'readOnly','livello-ricerca':'research','livello-scrittura-area':'workspaceWrite',
  'fermato-su-richiesta':'stopped','floor-comando-senza-recupero':'noRecovery','pre-mutation-guard':'checkpoint',
  'cartella-bloccata':'blockedFolder',
  /* K1: the early refusals ('rifiuto-anticipato', a fallback the kernel should never write, reads as the generic refusal) */
  'percorso-nt':'ntPath','rete-senza-conferma':'networkUnconfirmed','rete-negata':'networkDenied','fermato-chiedendo':'stopped',
  'credenziale-della-casa':'hostCredential',
  /* E1: the person declined the emulated call's card, or nobody was there to answer it */
  'carta-emulata':'notApproved',
  'modalita-sconosciuta':'unknownMode','testo-su-binario':'textOverBinary','sovrascrittura-non-letta':'unreadOverwrite',
};
/** Permission `via` of a refused tool receipt (talosHarness.mjs:6512-8597) → the dictionary id of its English. The five
 *  "asked" vias (`viaRichiesta`, :6608) refused mean the person said no. Read by the kernel's value and by v2's English one. */
export const REFUSAL_VIA:Readonly<Record<string,RefusalKind>>=Object.freeze({
  ...REFUSAL_VIA_KERNEL,
  ...Object.fromEntries(Object.entries(REFUSAL_VIA_KERNEL).map(([via,kind])=>[RECEIPT_VIA[via]??via,kind])),
});

/*
 * R5a lane R (S10, gate finding 15): the kernel's refusal sentence (`motivo` of a refused tool's receipt, talosHarness.mjs
 * `verificaPermessoScrittura`), matched WHOLE and shown in English on the screen's copy; the receipt, the model and v2 keep the
 * kernel's words. `tool` and `path` are the only variables. `fragment` is a constant part of the kernel's sentence, pinned
 * against the kernel source by r5a-r-denial.test.ts, so a reworded kernel turns that test red instead of going untranslated.
 */
export type RefusalReasonId='error.refusalReason.notApproved'|'error.refusalReason.readOnly'|'error.refusalReason.toolOff'|'error.refusalReason.research'
  |'error.refusalReason.researchPath'|'error.refusalReason.workspaceTool'|'error.refusalReason.workspacePath'|'error.refusalReason.noChannel'|'error.refusalReason.stoppedAsking'
  |'error.refusalReason.outsideNotConfirmed'|'error.refusalReason.outsideNotConfirmedFolder';
export const KERNEL_REFUSAL_REASONS:ReadonlyArray<{pattern:RegExp;id:RefusalReasonId;fragment?:string;legacy?:boolean}>=Object.freeze([
  {pattern:/^l'owner non ha approvato questa azione\.$/u,id:'error.refusalReason.notApproved',legacy:true},
  {pattern:/^la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso in questo momento\.$/u,id:'error.refusalReason.readOnly',legacy:true},
  {pattern:/^l'attrezzo "(?<tool>[^"]+)" è disattivato per questa sessione \(permesso per-attrezzo: nega\)\.$/u,id:'error.refusalReason.toolOff',legacy:true},
  {pattern:/^questa è una ricerca approfondita: può leggere, cercare e navigare, ma l'unica scrittura permessa è il deposito del proprio rapporto con "research_deposit" — "(?<tool>[^"]+)" resta negato\.$/u,id:'error.refusalReason.research',legacy:true},
  {pattern:/^il rapporto di una ricerca si deposita solo nella cartella di quella ricerca: "(?<path>[^"]*)" non ci risolve dentro\.$/u,id:'error.refusalReason.researchPath',legacy:true},
  {pattern:/^la sessione è limitata alla scrittura nel workspace: "(?<tool>[^"]+)" resta negato \(solo "scrivi" e "file_edit", che portano un percorso verificabile, sono ammessi a questo livello\)\.$/u,id:'error.refusalReason.workspaceTool',legacy:true},
  {pattern:/^"(?<path>[^"]*)" non risolve dentro il workspace corrente: la sessione è limitata alla scrittura nel workspace\.$/u,id:'error.refusalReason.workspacePath',legacy:true},
  {pattern:/^l'attrezzo "(?<tool>[^"]+)" richiede approvazione \(.+\), ma questa sessione non ha un canale di approvazione attivo\.$/u,id:'error.refusalReason.noChannel',legacy:true},
  {pattern:/^fermato su richiesta mentre aspettavo la tua approvazione per "(?<tool>[^"]+)"\.$/u,id:'error.refusalReason.stoppedAsking',legacy:true},
  /* desktop F4-03 (75108d7ee): the no to a write outside the session folder, with the folder when the kernel measured one */
  {pattern:/^la scrittura fuori dalla cartella della sessione non è stata confermata \("(?<path>[^"]*)"\)\. Non riprovare fuori: scrivi dentro il progetto, o chiedi alla persona cosa preferisce\.$/u,id:'error.refusalReason.outsideNotConfirmedFolder',legacy:true},
  {pattern:/^la scrittura fuori dalla cartella della sessione non è stata confermata\. Non riprovare fuori: scrivi dentro il progetto, o chiedi alla persona cosa preferisce\.$/u,id:'error.refusalReason.outsideNotConfirmed',legacy:true},
]);

/** K3 (desktop, 03/10): «⛔ generation stopped without an answer…» in either language. */
export function isStoppedWithoutAnswer(text:string|null|undefined):boolean{
  const value=String(text??'').trim();return value===KERNEL_RUN_TEXT.stoppedWithoutAnswer||value===KERNEL_RUN_TEXT.stoppedWithoutAnswerEn;
}
/*
 * K3 (desktop, 03/10/2026: the kernel's text for the model in English; whoever READS accepts both forms for good, whoever
 * WRITES changes once the reader is there): the eleven refusal reasons of `verificaPermessoScrittura` as the kernel writes
 * them after K3 (branch i18n/k3, talosHarness.mjs; the table k3-rifiuti-per-la-cli.md), same ids as the Italian rows. They are
 * pinned against the kernel source (K3 is merged, 04/10); the Italian rows are `legacy`, kept only to read sessions saved before it.
 */
export const KERNEL_REFUSAL_REASONS_EN:ReadonlyArray<{pattern:RegExp;id:RefusalReasonId;fragment:string}>=Object.freeze([
  {pattern:/^the owner did not approve this action\.$/u,id:'error.refusalReason.notApproved',fragment:"risposta.motivo ?? 'the owner did not approve this action.'"},
  {pattern:/^the session is read-only: no write, command or document is allowed right now\.$/u,id:'error.refusalReason.readOnly',fragment:"the session is read-only: no write, command or document is allowed right now."},
  {pattern:/^the tool "(?<tool>[^"]+)" is turned off for this session \(per-tool permission: deny\)\.$/u,id:'error.refusalReason.toolOff',fragment:"\" is turned off for this session (per-tool permission: deny)."},
  {pattern:/^this is a deep research: it can read, search and browse, but the only write allowed is depositing its own report with "research_deposit" — "(?<tool>[^"]+)" stays denied\.$/u,id:'error.refusalReason.research',fragment:"this is a deep research: it can read, search and browse, but the only write allowed is depositing its own report with \"research_deposit\" — \""},
  {pattern:/^a research report is deposited only in that research's own folder: "(?<path>[^"]*)" does not resolve inside it\.$/u,id:'error.refusalReason.researchPath',fragment:"a research report is deposited only in that research's own folder: \""},
  {pattern:/^the session is limited to writing in the workspace: "(?<tool>[^"]+)" stays denied \(only "scrivi" and "file_edit", which carry a verifiable path, are allowed at this level\)\.$/u,id:'error.refusalReason.workspaceTool',fragment:"\" stays denied (only \"scrivi\" and \"file_edit\", which carry a verifiable path, are allowed at this level)."},
  {pattern:/^"(?<path>[^"]*)" does not resolve inside the current workspace: the session is limited to writing in the workspace\.$/u,id:'error.refusalReason.workspacePath',fragment:"\" does not resolve inside the current workspace: the session is limited to writing in the workspace."},
  {pattern:/^the tool "(?<tool>[^"]+)" requires approval \(.+\), but this session has no active approval channel\.$/u,id:'error.refusalReason.noChannel',fragment:"), but this session has no active approval channel."},
  {pattern:/^stopped on request while waiting for the person's approval for "(?<tool>[^"]+)"\.$/u,id:'error.refusalReason.stoppedAsking',fragment:"const MOTIVO_FERMATO_CHIEDENDO = \"stopped on request while waiting for the person's approval\""},
  {pattern:/^writing outside the session folder was not confirmed \("(?<path>[^"]*)"\)\. Do not try again outside: write inside the project, or ask the person what they prefer\.$/u,id:'error.refusalReason.outsideNotConfirmedFolder',fragment:"writing outside the session folder was not confirmed"},
  {pattern:/^writing outside the session folder was not confirmed\. Do not try again outside: write inside the project, or ask the person what they prefer\.$/u,id:'error.refusalReason.outsideNotConfirmed',fragment:"writing outside the session folder was not confirmed"},
]);

/*
 * The display guard of Q-R2-2: a message with no mapping may appear on the default lines ONLY when it is not kernel prose.
 * The kernel writes Italian; the CLI writes English. This decides nothing about MEANING (that is the code's job, E4): it only
 * keeps an untranslated sentence off the screen, where D-05 forbids it, and sends it to `raw` (expanded detail and the log).
 * One Italian-only word (`è` included) or two short Italian function words mark it; English words that look alike
 * ("non-interactive", "per request") are not in either list. An accent alone does not: "café" or a name is not Italian.
 */
const ITALIAN_ONLY=new Set([
  'della','delle','dello','degli','nella','nelle','nello','negli','dalla','dalle','questo','questa','questi','queste','nessun','nessuna',
  'nessuno','fornitore','fornitori','chiave','chiavi','richiesta','sessione','giro','giri','attrezzo','attrezzi','strumento','strumenti','modello','modelli',
  'cartella','percorso','comando','interrotto','interrotta','rifiutata','rifiutato','approvato','agente','esterno','esterna','sono',
  'manca','mancano','controlla','riprova','inserisci','trovato','trovata','valido','valida','raggiungere','risposta','disponibile',
  'impossibile','errore','ancora','anche','ambiguo','ambigua','scelta','fuori','pacchetto','leggibile','codice','esegue','perché','quando','dopo','prima','ogni','senza','traffico','credenziale','catalogo','è','già','può','più',
  /* CE alignment (2026-09-25): the Context Engine's own words; «Preparazione del contesto non riuscita.» passed as English. */
  'contesto','preparazione','riuscita','riuscito','sintesi','compattazione','compattare','finestra',
]);
const ITALIAN_SHORT=new Set(['il','lo','la','le','gli','di','del','al','alla','che','una','uno','con','ha','hai','sei','è','e']);
export function looksItalian(text:string):boolean{
  const value=String(text);
  const words=value.toLowerCase().split(/[^\p{L}']+/u).map(word=>word.replace(/^(?:l|un|dell|all|nell|dall|sull)'/u,'')).filter(Boolean);
  if(words.some(word=>ITALIAN_ONLY.has(word)))return true;
  return words.filter(word=>ITALIAN_SHORT.has(word)&&word!=='e').length>=2;
}

/*
 * R4 Q-R4-16 (a), gate E11: the kernel probe's `motivo` (`harness-ui/src/provider-probe.mjs`), which `talos provider test` used to
 * print as it came, in Italian. Each sentence is a kernel constant whose only variables are the provider label, a count, an HTTP
 * status or a number of seconds; it is matched WHOLE (anchored) and printed in English, and anything else is not printed.
 * `fragment` is a constant part of the kernel's sentence: r4-f-provider-test.test.ts pins it against the kernel source, so a
 * reworded kernel turns that test red instead of silently printing nothing.
 */
type ProbeReasonId='firstrun.probe.catalog'|'firstrun.probe.catalogFirstPage'|'firstrun.probe.publicCatalog'|'firstrun.probe.keyAccepted'
  |'firstrun.probe.unreachable'|'firstrun.probe.timeout'|'firstrun.probe.redirect'|'firstrun.probe.keyRefused'|'firstrun.probe.keyNotAccepted'
  |'firstrun.probe.accessDenied'|'firstrun.probe.httpStatus'|'firstrun.probe.listNotFound'|'firstrun.probe.noAddress'|'firstrun.probe.noKey'
  |'firstrun.probe.minimalOk'|'firstrun.probe.invalidList'|'firstrun.probe.invalidMessage'|'firstrun.probe.declaredError';
export const KERNEL_PROBE_REASONS:ReadonlyArray<{pattern:RegExp;id:ProbeReasonId;plural?:boolean;fragment?:string;legacy?:boolean}>=Object.freeze([
  /* K4 (desktop, i18n of the server's texts): the kernel now writes these sentences in English (`motivo`, with its key in
     `motivoChiave`). They are mapped to the CLI's own wording, pinned against the kernel source. The Italian rows below stay
     only for details saved before K4 (no pin: the kernel no longer writes them). */
  {pattern:/^(?<provider>.+?): catalog reached, (?<count>\d+) models visible on the first page\. Generation was not tested\.$/u,id:'firstrun.probe.catalogFirstPage',plural:true,fragment:' models visible on the first page. Generation was not tested.'},
  {pattern:/^(?<provider>.+?): catalog reached, (?<count>\d+) models visible\. Generation was not tested\.$/u,id:'firstrun.probe.catalog',plural:true,fragment:': catalog reached, '},
  {pattern:/^(?<provider>.+?): public catalog reached, (?<count>\d+) models visible; key not verified\. Generation was not tested\.$/u,id:'firstrun.probe.publicCatalog',plural:true,fragment:' models visible; key not verified. Generation was not tested.'},
  {pattern:/^(?<provider>.+?): credential accepted\.$/u,id:'firstrun.probe.keyAccepted',fragment:': credential accepted.'},
  {pattern:/^Could not reach (?<provider>.+?)\.$/u,id:'firstrun.probe.unreachable',fragment:'Could not reach '},
  {pattern:/^(?<provider>.+?): no response within (?<seconds>\d+) seconds\.$/u,id:'firstrun.probe.timeout',fragment:': no response within '},
  {pattern:/^(?<provider>.+?): the response redirects to another address, and we do not follow it\. Check the address set for this provider\.$/u,id:'firstrun.probe.redirect',fragment:': the response redirects to another address, and we do not follow it. Check the address set for this provider.'},
  {pattern:/^(?<provider>.+?) rejected the credential \(HTTP (?<status>\d+)\)\.$/u,id:'firstrun.probe.keyRefused',fragment:' rejected the credential (HTTP '},
  {pattern:/^(?<provider>.+?): credential not accepted \(HTTP 401\)\.$/u,id:'firstrun.probe.keyNotAccepted',fragment:': credential not accepted (HTTP 401).'},
  {pattern:/^(?<provider>.+?): access denied \(HTTP 403\); check the permissions\.$/u,id:'firstrun.probe.accessDenied',fragment:': access denied (HTTP 403); check the permissions.'},
  {pattern:/^(?<provider>.+?) answered HTTP (?<status>\d+)\.$/u,id:'firstrun.probe.httpStatus',fragment:' answered HTTP '},
  {pattern:/^(?<provider>.+?): model list not found \(HTTP 404\)\. This response does not verify that the key is valid\.$/u,id:'firstrun.probe.listNotFound',fragment:': model list not found (HTTP 404). This response does not verify that the key is valid.'},
  {pattern:/^The address of (?<provider>.+?) is missing\.$/u,id:'firstrun.probe.noAddress',fragment:'The address of ${etichetta} is missing.'},
  {pattern:/^No key saved for (?<provider>.+?)\.$/u,id:'firstrun.probe.noKey',fragment:'No key saved for '},
  {pattern:/^(?<provider>.+?): minimal generation request succeeded; model list not verified\.$/u,id:'firstrun.probe.minimalOk',fragment:': minimal generation request succeeded; model list not verified.'},
  {pattern:/^(?<provider>.+?): HTTP (?<status>\d+) response without a valid model list; credential not verified\.$/u,id:'firstrun.probe.invalidList',fragment:' response without a valid model list; credential not verified.'},
  {pattern:/^(?<provider>.+?): HTTP (?<status>\d+) response without a valid message; credential not verified\.$/u,id:'firstrun.probe.invalidMessage',fragment:' response without a valid message; credential not verified.'},
  {pattern:/^(?<provider>.+?): the response declares an error, so the key is not confirmed\.$/u,id:'firstrun.probe.declaredError',fragment:': the response declares an error, so the key is not confirmed.'},
  {pattern:/^(?<provider>.+?): catalogo raggiunto, (?<count>\d+) modelli visibili nella prima pagina\. La generazione non è stata provata\.$/u,id:'firstrun.probe.catalogFirstPage',plural:true,legacy:true},
  {pattern:/^(?<provider>.+?): catalogo raggiunto, (?<count>\d+) modelli visibili\. La generazione non è stata provata\.$/u,id:'firstrun.probe.catalog',plural:true,legacy:true},
  {pattern:/^(?<provider>.+?): catalogo pubblico raggiunto, (?<count>\d+) modelli visibili; chiave non verificata\. La generazione non è stata provata\.$/u,id:'firstrun.probe.publicCatalog',plural:true,legacy:true},
  {pattern:/^(?<provider>.+?): credenziale accettata\.$/u,id:'firstrun.probe.keyAccepted',legacy:true},
  {pattern:/^Non è stato possibile raggiungere (?<provider>.+?)\.$/u,id:'firstrun.probe.unreachable',legacy:true},
  {pattern:/^(?<provider>.+?): nessuna risposta entro (?<seconds>\d+) secondi\.$/u,id:'firstrun.probe.timeout',legacy:true},
  {pattern:/^(?<provider>.+?): la risposta rinvia a un altro indirizzo, e non lo seguiamo\. Controlla l'indirizzo impostato per questo fornitore\.$/u,id:'firstrun.probe.redirect',legacy:true},
  {pattern:/^(?<provider>.+?) ha rifiutato la credenziale \(HTTP (?<status>\d+)\)\.$/u,id:'firstrun.probe.keyRefused',legacy:true},
  {pattern:/^(?<provider>.+?): credenziale non accettata \(HTTP 401\)\.$/u,id:'firstrun.probe.keyNotAccepted',legacy:true},
  {pattern:/^(?<provider>.+?): accesso negato \(HTTP 403\); controlla i permessi\.$/u,id:'firstrun.probe.accessDenied',legacy:true},
  {pattern:/^(?<provider>.+?) ha risposto HTTP (?<status>\d+)\.$/u,id:'firstrun.probe.httpStatus',legacy:true},
  {pattern:/^(?<provider>.+?): elenco modelli non trovato \(HTTP 404\)\. La validità della chiave non è verificata da questa risposta\.$/u,id:'firstrun.probe.listNotFound',legacy:true},
  {pattern:/^Manca l'indirizzo di (?<provider>.+?)\.$/u,id:'firstrun.probe.noAddress',legacy:true},
  {pattern:/^Nessuna chiave salvata per (?<provider>.+?)\.$/u,id:'firstrun.probe.noKey',legacy:true},
  {pattern:/^(?<provider>.+?): richiesta minima di generazione riuscita; elenco modelli non verificato\.$/u,id:'firstrun.probe.minimalOk',legacy:true},
  {pattern:/^(?<provider>.+?): risposta HTTP (?<status>\d+) senza un elenco modelli valido; credenziale non verificata\.$/u,id:'firstrun.probe.invalidList',legacy:true},
  {pattern:/^(?<provider>.+?): risposta HTTP (?<status>\d+) senza un messaggio valido; credenziale non verificata\.$/u,id:'firstrun.probe.invalidMessage',legacy:true},
  {pattern:/^(?<provider>.+?): la risposta dichiara un errore, quindi la chiave non è confermata\.$/u,id:'firstrun.probe.declaredError',legacy:true},
]);
/** The kernel probe's sentence in English, or null when no template matches it WHOLE (then nothing is printed). `label`, when
 *  given, replaces the kernel's label (the kernel's registry still has Italian labels, R2 §1.4). */
export function kernelProbeDetail(detail:string,{label}:{label?:string}={}):string|null{
  const text=String(detail??'').trim();
  for(const row of KERNEL_PROBE_REASONS){
    const match=row.pattern.exec(text);if(!match)continue;
    const groups=match.groups??{};const provider=label??groups.provider??'';
    const params={provider,...(groups.status?{status:groups.status}:{}),...(groups.seconds?{seconds:groups.seconds}:{})};
    return row.plural?tn(row.id as PluralId,Number(groups.count),params):t(`${row.id}` as MessageId,params);
  }
  return null;
}
