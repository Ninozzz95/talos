/*
 * Spesa di servizio (owner 30/10/2026, tre consigliate; contratto in-corso/CONTRATTO-SPESA-DI-SERVIZIO-2026-10-30.md, OK di CLI, Mobile
 * e Performance sulla bozza). Le chiamate pagate che NON sono richieste della chat — riassunto (fine giro, in anticipo, nel giro),
 * /compact, giudice della ricerca, motore del contesto — si contano in un evento dal NOME NUOVO: i lettori dell'«ultima richiesta»
 * (desktop `app.js` `registraUltimaRichiesta`, telefono `pannelloR4`, CLI `lastRequest`) leggono solo `consumo-fornitore` e restano
 * giusti, anche sui telefoni già installati; chi somma il conto legge i due nomi.
 *
 * ⛔ UN costruttore solo, qui nel codice condiviso (condizione della CLI): ogni ospite collega soltanto la porta `onConsumoDiServizio`.
 * ⛔ Il nome e lo schema non cambiano mai: un campo nuovo si aggiunge, non si rinomina.
 * ⛔ Una riga per tentativo pagato, ognuna col SUO uso (mai una somma: la somma C1b vive sull'errore, non sulla riga).
 * ⛔ `costoDichiarato`, `giro`, `runId` assenti quando non noti — mai 0 (0 = gratis / giro zero).
 */

export const NOME_CONSUMO_DI_SERVIZIO = 'consumo-di-servizio'
export const SCHEMA_CONSUMO_DI_SERVIZIO = 'talos.consumo-di-servizio.v1'
/* parte 2 C (30/10): 'giudice' è quello della ricerca; 'obiettivo' il giudice di /goal; 'domanda' la domanda della persona alla sessione.
   Chi LEGGE somma ogni scopo, anche uno che non conosce (sotto «altro»): un lettore vecchio totalizza giusto (Mobile).
   'computer-use' (04/11/2026, revisione del passo 5, difetto 6; OK di CLI e Performance alle 11:03-11:04): i passi sullo schermo che
   l'attrezzo chiede al modello della sessione. Come Hermes, che registra a parte ogni chiamata ausiliaria col suo compito
   (`agent/aux_accounting.py:1-10,45-49`); in coda all'elenco, così nessun indice degli scopi di prima cambia. */
export const SCOPI_DI_SERVIZIO = Object.freeze(['riassunto', 'compact', 'giudice', 'motore', 'obiettivo', 'domanda', 'computer-use'])
const ESITI = new Set(['completato', 'interrotto', 'fermato', 'traffico'])

const intero = (n) => Number.isSafeInteger(n) && n >= 0
const stringa = (s) => typeof s === 'string' && s.trim() !== ''

/*
 * Spesa dei riassunti nella scheda Contesto (owner 30/10/2026 sera, contratto in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO-2026-10-30.md,
 * forma chiusa da CLI, Mobile e Performance). L'identificativo di UN riassunto: nasce PRIMA del primo tentativo (Mobile 1), va su ogni riga
 * di spesa dei suoi tentativi e su ogni suo esito (fine, preparata, annullata: CLI 1, Performance), ed è unico per conversazione anche fra
 * due giri — un pezzo casuale del processo più un contatore (CLI 2, come `daTesto-<casuale>-<n>`). Il rigioco dal giornale li riaccoppia
 * perché sono scritti, mai ricalcolati. `crypto` globale: lo stesso modulo gira in Node e nel WebView del telefono.
 */
const PEZZO_DEL_PROCESSO = (() => {
  const b = new Uint8Array(6)
  globalThis.crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
})()
let contatoreRiassunti = 0
export function nuovoIdRiassunto() {
  contatoreRiassunti += 1
  return `rias-${PEZZO_DEL_PROCESSO}-${contatoreRiassunti}`
}
/** Un identificativo di riassunto accettabile su una riga o su un evento: stringa breve, mai testo libero. */
export const idRiassuntoValido = (id) => typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(id)

/* lo stesso uso pubblico di consumo-fornitore: solo i numeri del primo livello, i token letti dalla cache e quelli di ragionamento
   (Performance, 30/10: quanto «pensa» un riassunto è costo e tempo), niente corpi */
function usoPubblico(usage) {
  if (!usage || typeof usage !== 'object') return null
  const fuori = {}
  for (const [k, v] of Object.entries(usage)) if (typeof v === 'number' && Number.isFinite(v)) fuori[k] = v
  const dettagli = usage.prompt_tokens_details
  if (dettagli && typeof dettagli === 'object' && Number.isFinite(dettagli.cached_tokens)) fuori.prompt_tokens_details = { cached_tokens: dettagli.cached_tokens }
  const uscita = usage.completion_tokens_details
  if (uscita && typeof uscita === 'object' && Number.isFinite(uscita.reasoning_tokens)) fuori.completion_tokens_details = { reasoning_tokens: uscita.reasoning_tokens }
  return Object.keys(fuori).length ? fuori : null
}

/**
 * Il `value` dell'evento CUSTOM `consumo-di-servizio`. Lancia su uno scopo o un esito sconosciuti: un errore di contratto non si
 * degrada in silenzio (chi emette deve saperlo subito, nelle prove).
 */
export function valoreConsumoDiServizio({ scopo, riserva = false, fonte, modelloRemoto, usage = null, costoDichiarato, esito,
  at, maxTokensInviato, giro, richiestaDelGiro, runId, durataMs, inPrimoPiano, jobId, tentativi, idRiassunto, stimaTokenImmagine, stimaTokenTesto }) {
  if (!SCOPI_DI_SERVIZIO.includes(scopo)) throw new TypeError(`consumo-di-servizio: unknown scopo "${scopo}"`)
  if (!ESITI.has(esito)) throw new TypeError(`consumo-di-servizio: unknown esito "${esito}"`)
  if (typeof inPrimoPiano !== 'boolean') throw new TypeError('consumo-di-servizio: inPrimoPiano must be true or false')
  const uso = usoPubblico(usage)
  const costo = typeof costoDichiarato === 'number' && Number.isFinite(costoDichiarato) && costoDichiarato >= 0 ? costoDichiarato
    : typeof uso?.cost === 'number' && uso.cost >= 0 ? uso.cost : null
  return {
    schema: SCHEMA_CONSUMO_DI_SERVIZIO,
    scopo,
    ...(riserva === true ? { riserva: true } : {}),
    ...(stringa(fonte) ? { fonte } : {}),
    ...(stringa(modelloRemoto) ? { modelloRemoto } : {}),
    usage: uso,
    ...(costo !== null ? { costoDichiarato: costo } : {}),
    esito,
    at: stringa(at) ? at : new Date().toISOString(),
    ...(intero(maxTokensInviato) && maxTokensInviato > 0 ? { maxTokensInviato } : {}),
    ...(intero(giro) && giro > 0 ? { giro } : {}),
    /* Performance (30/10): l'indice della richiesta DENTRO il giro (da 0), lo stesso numero del `giro` degli eventi talos.compattazione —
       un campo suo, perché `giro` qui è il giro della conversazione (da 1) e i due numeri non vanno confusi */
    ...(intero(richiestaDelGiro) ? { richiestaDelGiro } : {}),
    ...(stringa(runId) ? { runId } : {}),
    /* parte 2 B (Performance, 30/10): il lavoro del motore del contesto a cui appartiene la chiamata — il banco somma le righe di un lavoro
       e le lega alla sua attesa nel giro */
    ...(stringa(jobId) ? { jobId } : {}),
    /* spesa dei riassunti (30/10 sera): il riassunto a cui appartiene questo tentativo; la scheda Contesto somma le righe con lo stesso id */
    ...(idRiassuntoValido(idRiassunto) ? { idRiassunto } : {}),
    ...(intero(durataMs) ? { durataMs } : {}),
    /* parte 2 C (Performance): quanti tentativi ha fatto la chiamata, solo se più di uno — lo scarto col credito del fornitore lo spiegano
       i ritentativi, e i token dei tentativi falliti il fornitore non li dice (mai inventati) */
    ...(intero(tentativi) && tentativi > 1 ? { tentativi } : {}),
    /* computer use (Performance, 04/11): quanto del passo è l'immagine dello schermo e quanto il testo, stimati PRIMA della chiamata — il
       fornitore dice solo il totale dei token d'ingresso (OpenRouter, «usage accounting»: prompt/completion/cached/reasoning, niente
       immagini a parte). Assenti quando non stimati, mai 0 inventato. */
    ...(intero(stimaTokenImmagine) ? { stimaTokenImmagine } : {}),
    ...(intero(stimaTokenTesto) ? { stimaTokenTesto } : {}),
    inPrimoPiano,
  }
}

/** L'evento intero, per chi ha un flusso AG-UI (registro del desktop, CLI). La Chat del telefono scrive lo stesso `value` su una riga sua. */
export function eventoConsumoDiServizio(campi) {
  return { type: 'CUSTOM', name: NOME_CONSUMO_DI_SERVIZIO, value: valoreConsumoDiServizio(campi) }
}

/**
 * La porta facoltativa degli ospiti: `onConsumoDiServizio(valore)`. Senza porta nessuna emissione (com'era). Un guasto della porta non
 * ferma mai la chiamata che ha pagato: il conto è un di più, la risposta no.
 */
export async function depositaConsumoDiServizio(porta, campi) {
  if (typeof porta !== 'function') return false
  const valore = valoreConsumoDiServizio(campi) // un errore di contratto risale a chi emette
  try { await porta(valore); return true } catch { return false }
}
