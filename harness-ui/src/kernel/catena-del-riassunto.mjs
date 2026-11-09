/*
 * C6-bis (owner 28/10/2026, «la proposta oltre tutti»; contratto CONTRATTO-RIASSUNTO-MAI-ASPETTARE-2026-10-27.md, sezioni «C6-bis»):
 *   QUALE modello scrive il riassunto quando quello scelto non va, e la catena che le Impostazioni mostrano PRIMA che serva.
 *   Funzioni PURE e senza testo (le parole le sceglie l'interfaccia dal `motivo`): le importano desktop, CLI e Mobile.
 *
 * ⛔ Le tre regole che reggono tutto:
 *   1. «bloccato» è passeggero: limite (429, limite del piano), rete (nessuno stato HTTP: ENOTFOUND, ECONNRESET, tempo scaduto, il PC
 *      che ospita il modello spento), posto occupato (un modello locale diverso da quello caricato per la chat: mai scaricarlo a metà
 *      giro, sul telefono e sul PC), motore non pronto (il motore locale spento; sul telefono, nessun modello aperto). Si riprova il
 *      modello scelto al riassunto dopo; `finoAlle` solo quando lo dice il fornitore o la panchina per chiave, mai stimato.
 *   2. «inutilizzabile» è solo 401/403/404 o niente chiave / fornitore non configurato: è l'unico caso che scrive l'evento durevole
 *      `talos.riassunto-modello-inutilizzabile` e chiede «Scegli un altro» (solo se l'aveva scelto la persona).
 *   3. Il modello della conversazione fa da riserva SOLO se la persona l'ha scelto come riserva (`'conversazione'`); mai in automatico
 *      (Hermes ripiega da solo sul modello principale, `agent/auxiliary_client.py`; noi no). Una sola eccezione, owner 01/11/2026: il posto occupato a fine giro (`conSostituto`):
 *      lì quel modello è già caricato e non costa niente a nessuno, e senza di lui il riassunto di una chat locale non lo scriveva mai un modello.
 */

export const MOTIVI_BLOCCATO = Object.freeze(['limite', 'rete', 'posto-occupato', 'rifiuto', 'motore-non-pronto'])
export const MOTIVI_INUTILIZZABILE = Object.freeze(['non-trovato', 'senza-chiave', 'accesso-negato', 'non-configurato'])

/* D7 (revisione di fine fase, 01/11/2026): i codici con cui la porta dei fornitori dice che manca l'accesso. `senzaChiave` lo metteva solo OpenRouter sulla
   strada del motore: per tutti gli altri la catena non sapeva leggere l'errore, e niente riserva né «Scegli un altro». */
const CODICI_SENZA_CHIAVE = new Set(['PROVIDER_KEY_MISSING', 'CHATGPT_NON_COLLEGATO'])

/* i codici di rete di Node/undici che non hanno uno stato HTTP (la richiesta non è arrivata o la risposta non è tornata) */
const CODICI_DI_RETE = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EHOSTUNREACH',
  'ENETUNREACH', 'ENETDOWN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])

const statoHttp = (errore) => {
  for (const v of [errore?.httpStatus, errore?.stato, errore?.status]) if (Number.isSafeInteger(v) && v >= 100 && v <= 599) return v
  return null
}
/* undici (fetch di Node) lancia `TypeError: fetch failed` e mette il codice in `cause.code`, a volte più giù (`cause.cause`) o dentro un
   `AggregateError` (happy eyeballs, `errors[]`): si scende per qualche livello, in ampiezza (CLI 30/10) */
const codiceDiRete = (errore) => {
  const coda = [errore]
  for (let visti = 0; coda.length && visti < 12; visti += 1) {
    const e = coda.shift()
    if (!e || typeof e !== 'object') continue
    if (typeof e.code === 'string' && CODICI_DI_RETE.has(e.code)) return e.code
    if (e.cause) coda.push(e.cause)
    if (Array.isArray(e.errors)) coda.push(...e.errors.slice(0, 4))
  }
  return null
}
/* La `classe` che l'involucro dei fornitori (`runtime-owner-adapter.mjs`, `erroreFornitorePubblico`) mette sull'errore che ricostruisce,
   senza la causa originale: la tabella BC-44 (`classificaErroreDiCorsa`) l'ha già letta, qui si traduce e basta. Le classi che non sono
   «il modello non va» (contesto pieno, richiesta non valida, Stop, esito incerto, ignoto) non si traducono: decide il riassunto di oggi. */
const DALLA_CLASSE = Object.freeze({
  rete: ['bloccato', 'rete'], 'timeout-fornitore': ['bloccato', 'rete'], 'flusso-interrotto': ['bloccato', 'rete'],
  traffico: ['bloccato', 'limite'], 'budget-occupato': ['bloccato', 'limite'], 'guasto-fornitore': ['bloccato', 'limite'],
  credito: ['bloccato', 'limite'], 'limite-chiave': ['bloccato', 'limite'], 'limite-credito': ['bloccato', 'limite'], 'richiesta-costosa': ['bloccato', 'limite'],
  'rifiuto-del-modello': ['bloccato', 'rifiuto'], // riguarda questa conversazione: si passa alla riserva, senza nessuna ora di fermo
  credenziale: ['inutilizzabile', 'accesso-negato'], accesso: ['inutilizzabile', 'accesso-negato'],
  'modello-non-disponibile': ['inutilizzabile', 'non-trovato'], 'tutti-esclusi': ['inutilizzabile', 'non-configurato'],
})

/* CLI e Mobile (30/10): un limite del PIANO o dell'ACCOUNT non è del modello — un altro modello sullo stesso piano fallisce uguale e
   la chiamata è sprecata. Il codice del piano ChatGPT (`chatgpt-richiesta.mjs`, ERRORI_DEL_PIANO), il suo codice OpenAI nel corpo, e le
   classi di credito/tetto di spesa che l'involucro dei fornitori mette (`runtime-owner-adapter.mjs`). */
const CLASSI_DI_ACCOUNT = new Set(['credito', 'limite-chiave', 'limite-credito'])
function eLimiteDiAccount(errore) {
  if (errore?.code === 'CHATGPT_LIMITE_DEL_PIANO' || CLASSI_DI_ACCOUNT.has(errore?.classe)) return true
  return /subscription_sharing_usage_limit_exceeded/u.test(String(errore?.message ?? ''))
}
/** Il fornitore di un id di modello: la via prima dei due punti, OpenRouter senza via (come gli id della catena). */
export const fornitoreDi = (id) => /^([a-z][a-z0-9-]*):(?=.)/u.exec(String(id ?? ''))?.[1] ?? 'openrouter'

/**
 * Un errore del riassunto, classificato UNA volta nel nucleo.
 * @returns {{ stato: 'bloccato', motivo: 'limite'|'rete'|'rifiuto'|'motore-non-pronto', finoAlle: number|null } | { stato: 'inutilizzabile', motivo: string } | null}
 *   `null` = non è un errore del modello (lo Stop della persona, o un errore che non sappiamo leggere: il riassunto di oggi decide).
 */
export function classificaErroreDelRiassunto(errore, { ora = Date.now() } = {}) {
  if (!errore || errore.fermatoSuRichiesta === true) return null
  if (errore.senzaChiave === true || CODICI_SENZA_CHIAVE.has(errore.code)) return { stato: 'inutilizzabile', motivo: 'senza-chiave' }
  if (errore.nonConfigurato === true) return { stato: 'inutilizzabile', motivo: 'non-configurato' }
  if (errore.code === 'LOCAL_RUNTIME_NOT_READY') return { stato: 'bloccato', motivo: 'motore-non-pronto', finoAlle: null } // passeggero: il modello può tornare da solo
  const s = statoHttp(errore)
  if (s === 401 || s === 403) return { stato: 'inutilizzabile', motivo: 'accesso-negato' }
  if (s === 404) return { stato: 'inutilizzabile', motivo: 'non-trovato' }
  if (s === 429) {
    const dichiarato = Number.isFinite(errore.retryAt) && errore.retryAt > ora ? errore.retryAt : null
    return { stato: 'bloccato', motivo: 'limite', finoAlle: dichiarato, ...(eLimiteDiAccount(errore) ? { diAccount: true } : {}) }
  }
  if (s !== null && s >= 500) return { stato: 'bloccato', motivo: 'limite', finoAlle: null } // un sovraccarico annulla QUESTO riassunto
  const daClasse = typeof errore.classe === 'string' && Object.hasOwn(DALLA_CLASSE, errore.classe) ? DALLA_CLASSE[errore.classe] : null
  if (daClasse) {
    const [stato, motivo] = daClasse
    if (stato === 'inutilizzabile') return { stato, motivo }
    const dichiarato = Number.isFinite(errore.retryAt) && errore.retryAt > ora ? errore.retryAt : null
    return { stato, motivo, finoAlle: motivo === 'limite' ? dichiarato : null, ...(motivo === 'limite' && eLimiteDiAccount(errore) ? { diAccount: true } : {}) }
  }
  /* ⛔ un AbortError è lo Stop della persona (o di chi la rappresenta), mai «la rete»: solo un TimeoutError lo è (AbortSignal.timeout) */
  if (s === null && errore.name !== 'AbortError' && (codiceDiRete(errore) || errore.name === 'TimeoutError' || (errore.name === 'TypeError' && /fetch failed/iu.test(String(errore.message))))) {
    return { stato: 'bloccato', motivo: 'rete', finoAlle: null }
  }
  return null
}

/* uno stesso modello scritto in due modi (con o senza la via `openrouter:`) */
const senzaVia = (id) => String(id ?? '').replace(/^openrouter:/u, '')
const stessoModello = (a, b) => senzaVia(a) === senzaVia(b)
/*
 * ⛔⛔⛔ TERZO CONTROLLO (17/09/2026): le sole due forme di un id di modello che TALOS sa leggere, `fornitore:modello` e `organizzazione/modello`. Un nome che non ne
 *   ha una si rifiuta: `separaFonteModello` su un id nudo risponde `openrouter`, e un GGUF locale partirebbe verso openrouter.ai col nome di un file.
 *   R8 (revisione del Blocco 21, 01/11/2026): sta qui e non più nel registro perché la leggono anche le Impostazioni (`impostazioni-contesto.mjs`): la rotta accettava
 *   ogni stringa, il giro la scartava e la catena diceva «pronto».
 *   Revisione del Blocco 22, F4 (01/11/2026): il `~` iniziale è un alias vero di OpenRouter, «sempre l'ultima versione» (12 id su 417, `model-catalog.mjs:33`), e `config.mjs:205`
 *   lo ammette. La carta lo offriva e la rotta rispondeva 400. Vale solo davanti a `organizzazione/modello`.
 */
export function formaDiModelloRiconosciuta(nome) {
  if (typeof nome !== 'string' || !nome.trim()) return false
  const n = nome.trim()
  return /^[a-z0-9][a-z0-9._-]*:.+$/iu.test(n) || /^~?[a-z0-9][a-z0-9._-]*\/.+$/iu.test(n)
}
/* il posto UNICO è il nostro motore locale: `local:`, llama-server sul PC, e `locale-ospite:`, il motore dell'app che ospita r4, cioè il telefono
   (`accesso-locale-ospite.mjs`). Ollama e LM Studio gestiscono la memoria da soli. */
export const eLocale = (id) => /^(?:local|locale-ospite):/u.test(String(id ?? ''))

/**
 * La catena che le Impostazioni mostrano e che il riassunto segue, nell'ordine.
 * @param {object} p
 * @param {string|null} p.scelto           il modello scelto dalla precedenza (`modelloDelRiassuntoScelto`)
 * @param {{provider?:string, model:string}|'conversazione'|null} p.riserva  `riservaDelRiassunto`
 * @param {string|null} p.modelloConversazione
 * @param {(id:string)=>({stato:'bloccato'|'inutilizzabile', motivo:string, finoAlle?:number|null}|null)} [p.statoDi]
 *        cosa si sa adesso di quel modello (la panchina per chiave, l'ultimo errore classificato); null = pronto
 * @param {string|null} [p.localeCaricato] il modello locale caricato adesso per la chat (posto unico)
 * @param {boolean} [p.inUnGiro]          dentro un giro: un locale diverso da quello caricato non si tenta
 * @returns {{ ruolo:'scelto'|'riserva'|'senza-modello', modello:string|null, stato:'pronto'|'bloccato'|'inutilizzabile', finoAlle?:number|null, motivo?:string }[]}
 */
export function catenaDelRiassunto({ scelto = null, riserva = null, modelloConversazione = null, statoDi = () => null, localeCaricato = null, inUnGiro = false, conSostituto = false, localiInsieme = false, ora = Date.now() } = {}) {
  const anello = (ruolo, modello) => {
    if (!modello) return null
    /* Perf-Q1 (30/10): anche in sottofondo — fra due giri un altro GGUF scaricherebbe il modello della chat e il giro dopo ne pagherebbe la
       ricarica. Solo se un modello locale È caricato per la chat: con la chat su un modello remoto un locale non toglie il posto a nessuno. */
    if (inUnGiro && !localiInsieme && localeCaricato && eLocale(modello) && !stessoModello(modello, localeCaricato)) return { ruolo, modello, stato: 'bloccato', motivo: 'posto-occupato', finoAlle: null }
    const noto = statoDi(modello)
    if (!noto) return { ruolo, modello, stato: 'pronto' }
    if (noto.stato === 'bloccato' && Number.isFinite(noto.finoAlle) && noto.finoAlle <= ora) return { ruolo, modello, stato: 'pronto' } // il limite si è riaperto
    if (noto.stato === 'inutilizzabile' && MOTIVI_INUTILIZZABILE.includes(noto.motivo)) return { ruolo, modello, stato: 'inutilizzabile', motivo: noto.motivo }
    if (noto.stato === 'bloccato' && MOTIVI_BLOCCATO.includes(noto.motivo)) return { ruolo, modello, stato: 'bloccato', motivo: noto.motivo, finoAlle: Number.isFinite(noto.finoAlle) ? noto.finoAlle : null, ...(noto.diAccount ? { diAccount: true } : {}) }
    return { ruolo, modello, stato: 'pronto' } // uno stato che non conosciamo non toglie un modello: si prova
  }
  const modelloRiserva = riserva === 'conversazione' ? modelloConversazione
    : riserva && typeof riserva === 'object' && typeof riserva.model === 'string' && riserva.model.trim()
      ? (riserva.provider && riserva.provider !== 'openrouter' ? `${riserva.provider}:${riserva.model.trim()}` : riserva.model.trim()) : null
  const catena = [anello('scelto', scelto)]
  if (modelloRiserva && !stessoModello(modelloRiserva, scelto)) catena.push(anello('riserva', modelloRiserva))
  /* Owner 01/11/2026, «Scrive il modello aperto»: il posto occupato non scarica mai il modello della chat, e a fine giro, a motore libero, scrive lui. Solo chi lo chiede: dentro
     il giro la chat non aspetta (27/10, 28/10), e le Impostazioni mostrano la catena della persona. Forma `FORMA-RIASSUNTO-MODELLO-APERTO-2026-11-01.md`, OK di Desktop, Mobile, CLI, Performance. */
  if (conSostituto && catena.some((a) => a?.motivo === 'posto-occupato') && !catena.some((a) => a && stessoModello(a.modello, localeCaricato))) catena.push(anello('sostituto', localeCaricato))
  catena.push({ ruolo: 'senza-modello', modello: null, stato: 'pronto' })
  /* un limite dell'account ferma anche gli altri modelli dello STESSO fornitore (la riserva sullo stesso piano non si chiama) */
  const fermiPerAccount = new Map(catena.filter((a) => a && a.stato === 'bloccato' && a.diAccount).map((a) => [fornitoreDi(a.modello), a]))
  return catena.filter(Boolean).map((a) => (a.modello && a.stato === 'pronto' && fermiPerAccount.has(fornitoreDi(a.modello))
    ? { ...a, stato: 'bloccato', motivo: 'limite', finoAlle: fermiPerAccount.get(fornitoreDi(a.modello)).finoAlle ?? null, diAccount: true } : a))
}

/*
 * La MEMORIA dei modelli dei riassunti (una `Map` id → { stato, motivo, finoAlle?, scadeAlle }, più `avvisati`: i modelli per cui
 * l'avviso durevole è già stato scritto). Le stesse regole per la strada legacy e per quella del motore del contesto:
 *   - inutilizzabile ⇒ ricordato 15 minuti, poi si riprova (la persona può aver sistemato la chiave);
 *   - senza chiave ⇒ non si ricorda: la chiave messa vale subito (Mobile e CLI, 01/11/2026). Riprovare non costa niente, l'errore arriva prima della rete, e le porte che
 *     danno un accesso sono cinque sulle tre app: così le copre tutte, anche quelle future, senza un gancio per ciascuna. L'avviso resta uno solo;
 *   - bloccato con un'ora DETTA ⇒ ricordato fino a quell'ora; senza ora (rete, sovraccarico, posto occupato) ⇒ non si ricorda;
 *   - l'avviso durevole una volta per modello, e di nuovo solo dopo che quel modello ha risposto (`dimenticaModello`).
 * Senza memoria (null) non si ricorda niente e l'avviso vale a ogni guasto: è la forma di chi non tiene stato.
 */
export const MEMORIA_INUTILIZZABILE_MS = 15 * 60_000

/** Ciò che la memoria sa di un modello adesso (un ricordo scaduto se ne va), nella forma che `catenaDelRiassunto` legge come `statoDi`. */
export function statoDallaMemoria(memoria, id, { ora = Date.now() } = {}) {
  const noto = memoria?.get?.(id) ?? null
  if (noto && Number.isFinite(noto.scadeAlle) && noto.scadeAlle <= ora) { memoria.delete(id); return null }
  return noto
}

/**
 * FE-053 (01/11/2026): ciò che le memorie di tutte le conversazioni sanno di un modello, per chi non guarda una conversazione (le Impostazioni). Un limite del
 * piano o un accesso negato non dipendono dalla conversazione. Vince l'inutilizzabile, poi l'attesa più lunga; senza un'ora l'attesa conta come la più lunga.
 * Condizione di Performance: un successo in UNA conversazione cancella ciò che le altre sapevano da prima (`dimenticaModello` vale per una memoria sola).
 * Condizione del Mobile: un modello avvisato resta tale finché non risponde, oltre i 15 minuti della memoria: lo stato si legge in `avvisatiCon`.
 */
export function statoPerTuttoIlPc(memorie, id, { ora = Date.now() } = {}) {
  const lista = [...memorie].filter(Boolean)
  /* R9 (revisione del Blocco 21): le memorie hanno il nome di chi ha scritto. L'adattatore toglie la via (`idDelModello`), la strada semplice tiene quello della catena */
  const nudo = senzaVia(id)
  const nomi = nudo === id ? [id, `openrouter:${id}`] : [nudo, id]
  const riuscito = Math.max(0, ...lista.flatMap((m) => nomi.map((nome) => m.riusciti?.get(nome) ?? 0)))
  const peso = (s) => (s.stato === 'inutilizzabile' ? Infinity : s.finoAlle ?? Number.MAX_SAFE_INTEGER)
  let migliore = null
  for (const memoria of lista) {
    for (const nome of nomi) {
      const noto = statoDallaMemoria(memoria, nome, { ora }) ?? memoria.avvisatiCon?.get(nome) ?? null
      if (!noto || (riuscito > 0 && (noto.dal ?? 0) <= riuscito)) continue
      if (!migliore || peso(noto) > peso(migliore)) migliore = noto
    }
  }
  return migliore
}

/** Ricorda un giudizio del classificatore. Torna `{ daAvvisare }`: vero solo per un modello inutilizzabile non ancora avvisato. */
export function ricordaGiudizio(memoria, modello, giudizio, { ora = Date.now() } = {}) {
  if (!giudizio || typeof modello !== 'string' || !modello) return { daAvvisare: false }
  if (giudizio.stato === 'inutilizzabile') {
    if (giudizio.motivo !== 'senza-chiave') {
      memoria?.set?.(modello, { stato: 'inutilizzabile', motivo: giudizio.motivo, dal: ora, scadeAlle: ora + MEMORIA_INUTILIZZABILE_MS })
      if (memoria) (memoria.avvisatiCon ??= new Map()).set(modello, { stato: 'inutilizzabile', motivo: giudizio.motivo, dal: ora })
    }
    const avvisati = memoria ? (memoria.avvisati ??= new Set()) : null
    if (avvisati?.has(modello)) return { daAvvisare: false }
    avvisati?.add(modello)
    return { daAvvisare: true }
  }
  if (Number.isFinite(giudizio.finoAlle)) memoria?.set?.(modello, { stato: 'bloccato', motivo: giudizio.motivo, dal: ora, finoAlle: giudizio.finoAlle, scadeAlle: giudizio.finoAlle, ...(giudizio.diAccount ? { diAccount: true } : {}) })
  return { daAvvisare: false }
}

/** Il modello ha risposto: quello che si sapeva di lui non vale più, e un guasto futuro si dirà di nuovo. */
export function dimenticaModello(memoria, modello, { ora = Date.now() } = {}) {
  memoria?.delete?.(modello)
  memoria?.avvisati?.delete(modello)
  memoria?.avvisatiCon?.delete(modello)
  if (memoria && typeof memoria === 'object') (memoria.riusciti ??= new Map()).set(modello, ora)
}

/**
 * Perché un anello non ha scritto, per la riga in chat (FE-053, Mobile): chi guarda deve poter dire «fino alle 14:30» e «limite del piano», che senza `diAccount` sarebbe
 * falso: `limite` copre anche un 429 qualunque. `null` se l'anello era pronto.
 */
export function anelloNonDisponibile(anello) {
  if (!anello || anello.stato === 'pronto') return null
  return { modello: anello.modello, stato: anello.stato, motivo: anello.motivo ?? null, ...(Number.isFinite(anello.finoAlle) ? { finoAlle: anello.finoAlle } : {}), ...(anello.diAccount ? { diAccount: true } : {}) }
}

/** Il primo anello che si può usare adesso (l'ultimo, «senza modello», lo è sempre: la chat non aspetta mai). */
export const anelloDaUsare = (catena) => catena.find((a) => a.stato === 'pronto') ?? { ruolo: 'senza-modello', modello: null, stato: 'pronto' }
