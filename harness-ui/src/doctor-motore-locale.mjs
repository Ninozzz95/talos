/**
 * doctor-motore-locale.mjs — «Prova il motore locale» del Doctor (owner 11/11/2026 13:50, decisione 9: «Sì, prova vera»).
 *
 * Il Doctor chiede al modello locale una risposta minima e dice se risponde e in quanto tempo. La prova misura il motore VERO: passa da
 * `localRuntimes['llama.cpp'].generateStream`, la stessa strada di una chat locale e di «Migliora il prompt».
 *
 * ⛔ Giudice v1477, correzione 3 (decisione 1350 punto 2, «mai chiusure di nascosto»): il Doctor NON carica e NON scarica mai un modello.
 *   Una richiesta a un motore senza modello in memoria lo caricherebbe (memoria piena, secondi d'attesa, e un modello già aperto
 *   potrebbe dover lasciare il posto). Quindi:
 *   · nessun modello locale installato ⇒ «nessunModello», e niente si scarica;
 *   · modelli installati ma nessuno caricato ⇒ «nessunCaricato», e niente parte verso il motore;
 *   · un modello caricato ⇒ la richiesta va a QUEL modello (il supervisore la rifiuta se intanto non è più pronto: `request` di
 *     `llama-router-supervisor.mjs`, «runtime is not ready»).
 * La forma dei concorrenti: Codex prova la raggiungibilità con una HEAD/GET e 3 s (`codex-rs/cli/src/doctor.rs:2931-2970`), il tempo per
 *   controllo (`:854-856`); Hermes chiede `/models` al motore locale con `timeout=3` senza generare
 *   (`hermes_cli/web_routers/local_models.py:495`); pi `curl …/health` (`packages/coding-agent/docs/llama-cpp.md:112`). L'owner ha scelto
 *   la risposta minima (un token): l'attesa è più lunga dei 3 s di Codex perché un modello sulla CPU può metterci qualche secondo.
 */
import { randomUUID } from 'node:crypto';

/** Quanto si aspetta la risposta minima prima di dire «non ha risposto». */
export const ATTESA_DELLA_PROVA_MS = 30_000;
/**
 * Giro dopo il revisore (giudice v1503, opzione A). Col motore a router un modello DORME dopo 15 minuti fermo
 * (`llama-router-supervisor.mjs:77`, `:137-139`), mentre `status()` resta «ready» (`:443-447`) e la POST di `request()` lo risveglierebbe
 * (`:1208-1218`; llama.cpp ricarica il modello all'uscita dal sonno, `server-context.cpp:1160-1163`). Prima della prova si chiede quindi al
 * router lo stato del modello: `GET /models` dice `status.value` = «loaded», «sleeping», «unloaded»… (`server-models.cpp:2149-2151`) e non
 * carica niente; `autoload=false` come Hermes per ogni lettura di stato (`hermes_cli/local_runtime/endpoint.py:20-29`), 3 s come Hermes
 * (`hermes_cli/web_routers/local_models.py:495`). Il motore singolo (quello di serie) non dorme e non dice lo stato: si prova.
 */
export const PERCORSO_DELLO_STATO = '/models?autoload=false';
export const ATTESA_DELLO_STATO_MS = 3_000;
/**
 * La lettura dello stato che il server dà al Doctor (`localRuntimes['llama.cpp'].statoDelMotore`): solo `GET /models` (col router il
 * supervisore filtra il modello corrente, `llama-router-supervisor.mjs:1201`), col solo segnale di chi chiede; ogni altro percorso è rifiutato.
 */
export const statoDalSupervisore = (supervisor) => (percorso, opzioni = {}) => (String(percorso).split('?')[0] === '/models'
  ? supervisor.request(percorso, { signal: opzioni.signal })
  : Promise.reject(Object.assign(new Error('only the model list'), { code: 'QUERY_INVALID' })));

/** «loaded», «sleeping»…, `null` se il motore non dice lo stato (motore singolo), `undefined` se non si è potuto leggere. */
async function statoDelModello(motore, modelId, attesaStatoMs) {
  if (typeof motore.statoDelMotore !== 'function') return undefined;
  try {
    const risposta = await motore.statoDelMotore(PERCORSO_DELLO_STATO, { signal: AbortSignal.timeout(attesaStatoMs) });
    if (!risposta?.ok) return undefined;
    const corpo = await risposta.json();
    const modello = Array.isArray(corpo?.data) ? corpo.data.find((m) => m?.id === modelId) : null;
    if (!modello) return Array.isArray(corpo?.data) && corpo.data.length === 0 ? 'unloaded' : undefined;
    const valore = modello.status?.value ?? modello.status;
    return typeof valore === 'string' ? valore : null;
  } catch {
    return undefined;
  }
}
/** La richiesta minima: la stessa frase della qualifica dei modelli (`local-runtime-probe.mjs`, `qualify`), un token solo. */
const MESSAGGI = Object.freeze([Object.freeze({ role: 'user', content: 'Reply with OK.' })]);

/**
 * @param {object} opzioni
 * @param {() => Promise<Array<{id:string, repo?:string, state:string}>>} opzioni.modelli i modelli locali installati (`localModelStore.list`)
 * @param {{ detect: Function, generateStream: Function, statoDelMotore?: Function } | null} opzioni.motore `localRuntimes['llama.cpp']`, o null senza motore
 * @returns {Promise<{esito:'nessunModello'|'nessunMotore'|'nessunCaricato'} | {esito:'dorme'|'statoIgnoto', modelId:string, nome:string}
 *   | {esito:'risponde'|'errore', modelId:string, nome:string, ms:number, codice?:string}>}
 */
export async function provaIlMotoreLocale({ modelli, motore, adessoMs = () => performance.now(), attesaMs = ATTESA_DELLA_PROVA_MS, attesaStatoMs = ATTESA_DELLO_STATO_MS } = {}) {
  const pronti = (typeof modelli === 'function' ? await modelli() : []).filter((m) => m && m.state === 'ready' && typeof m.id === 'string');
  if (!pronti.length) return { esito: 'nessunModello' };
  if (typeof motore?.detect !== 'function' || typeof motore.generateStream !== 'function') return { esito: 'nessunMotore' };
  const stato = await motore.detect('llama.cpp');
  const modelId = stato?.runtimeState === 'ready' && typeof stato.modelId === 'string' && stato.modelId ? stato.modelId : null;
  if (!modelId) return { esito: 'nessunCaricato' }; // ⛔ niente parte: una richiesta qui caricherebbe un modello
  const nome = pronti.find((m) => m.id === modelId)?.repo || modelId;
  const statoOra = await statoDelModello(motore, modelId, attesaStatoMs);
  if (statoOra === undefined) return { esito: 'statoIgnoto', modelId, nome }; // ⛔ senza sapere se è sveglio, niente parte
  if (statoOra === 'sleeping') return { esito: 'dorme', modelId, nome }; // ⛔ la prova lo sveglierebbe: niente parte
  if (statoOra !== null && statoOra !== 'loaded') return { esito: 'nessunCaricato' };
  const giro = `doctor-${randomUUID()}`;
  const fermo = new AbortController();
  const inizio = adessoMs();
  const tempo = () => Math.max(0, Math.round(adessoMs() - inizio));
  let orologio;
  const scaduto = new Promise((risolvi) => { orologio = setTimeout(() => { fermo.abort(); risolvi('TIMEOUT'); }, attesaMs); });
  const prova = (async () => {
    let finito = false;
    for await (const evento of motore.generateStream({ runId: giro, turnId: giro, modelId, messages: MESSAGGI, maxTokens: 1, signal: fermo.signal })) {
      if (evento?.type === 'error') return evento.code || 'RUNTIME_ERROR';
      if (evento?.type === 'done') finito = true;
    }
    return finito ? null : 'INCOMPLETE';
  })().catch((errore) => (fermo.signal.aborted ? 'TIMEOUT' : errore?.code || 'RUNTIME_ERROR'));
  try {
    const codice = await Promise.race([prova, scaduto]);
    const ms = tempo();
    return codice ? { esito: 'errore', modelId, nome, ms, codice } : { esito: 'risponde', modelId, nome, ms };
  } finally {
    clearTimeout(orologio);
  }
}
