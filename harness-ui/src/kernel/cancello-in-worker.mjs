/*
 * R-39 (Performance, 30/10/2026; forma chiusa con Desktop, CLI e Mobile) — il cancello delle scritture in un `worker_thread` del NUCLEO
 *   (non del server: la CLI non ne ha uno). Il filo principale non fa più lavoro del compilatore: manda `{ radice, percorso, contenuto }`
 *   a `cancello-worker.mjs` e aspetta l'esito, che è lo stesso della strada di prima per costruzione (stessa funzione, stessi dati).
 *
 * Forma presa da Cline (`sdk/packages/core/src/services/workspace/file-indexer.ts`, clone del 21/10/2026): richieste numerate, `unref`,
 *   ripiego sulla strada di sempre se il worker sbaglia. Due differenze volute:
 *   · lì un worker caduto resta morto e ogni richiesta dopo aspetta il suo tetto; qui rinasce alla richiesta dopo, e dopo
 *     `CADUTE_MASSIME` cadute il processo resta sulla strada di prima (niente ciclo di nascite);
 *   · lì il worker è sempre `unref`: se il filo principale non ha altro da fare, il processo può chiudersi mentre aspetta l'esito. Qui
 *     il worker tiene vivo il processo SOLO mentre c'è una richiesta in volo (`ref` / `unref`), e mai da fermo.
 *
 * Le condizioni delle tre sessioni (30/10 sera):
 *   · Desktop: la memoria torna (il worker si chiude dopo `INATTIVITA_WORKER_MS` senza richieste e rinasce alla prossima); stesso
 *     confine (il worker legge solo la radice che la strada di prima leggeva già); esito con la stessa forma.
 *   · CLI: ingresso a sé esportato (`PERCORSO_DEL_CANCELLO_WORKER`), prova rossa se il worker doveva partire e non è partito
 *     (`statoCancelloWorker`); la casa Linux resta sulla strada di prima (la decide chi chiama: `leggiPrima`); un tetto di memoria
 *     (`resourceLimits`) legato al tetto del cancello: superato, il worker muore e la richiesta torna sulla strada di prima.
 *   · Mobile: su `android` niente worker, con UN solo punto che legge la piattaforma (`cancelloWorkerAmmesso`), così al compilatore
 *     sul telefono si potrà misurare e spostare.
 *
 * `TALOS_CANCELLO_WORKER=0` spegne il worker (la strada di prima, come oggi); `TALOS_CANCELLO_WORKER_MB` cambia il tetto della memoria
 * (le prove lo usano per farlo cadere). Nessuna variabile sceglie il FILE del worker: vedi `nasci`.
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { tettoCancello } from './dist/kernelPerIlBanco.js'

export const PERCORSO_DEL_CANCELLO_WORKER = fileURLToPath(new URL('./cancello-worker.mjs', import.meta.url))
/* Come `INATTIVITA_CANCELLO_MS` di kernelPerIlBanco.js: dopo 10 minuti fermi la cache del compilatore si svuotava già; ora se ne va
   il worker intero, e con lui la memoria che teneva (misurato il 30/10: +265–323 MB di rss dopo la prima scrittura). */
export const INATTIVITA_WORKER_MS = 10 * 60 * 1000
/* Un worker che non risponde non ferma la scrittura per sempre: oltre questo si giudica sulla strada di prima. Largo apposta: la prima
   scrittura su un progetto grande sotto carico misurava 1,7 s. */
const ATTESA_MASSIMA_MS = 60 * 1000
/* solo per le prove: un'attesa più corta (un worker che «non risponde» in pochi ms); un numero, mai un percorso o un comando */
function attesaMassimaMs(ambiente = process.env) {
    const chiesto = String(ambiente?.TALOS_CANCELLO_WORKER_ATTESA_MS ?? '').trim()
    return /^\d{1,6}$/.test(chiesto) && Number(chiesto) > 0 ? Number(chiesto) : ATTESA_MASSIMA_MS
}
const CADUTE_MASSIME = 2
/*
 * Revisione del Desktop R2 (30/10): «spento» per sempre era un difetto sul desktop, dove il server resta acceso per giorni — due
 *   cadute passeggere (un progetto enorme aperto per sbaglio, due volte il tetto della memoria) riportavano il blocco da 1,4 s fino al
 *   riavvio, senza che nessuno lo sapesse. Ora: una riga nel registro, una volta per spegnimento, col motivo; e dopo
 *   `RIAPERTURA_DOPO_MS` il worker si riprova (cadute azzerate). 30 minuti: tre volte la chiusura per inattività, abbastanza perché un
 *   progetto troppo grande per il tetto non faccia nascere e morire un worker a ogni scrittura (ogni caduta costa un ripiego sul filo
 *   principale, cioè il blocco di prima, mai di più).
 */
export const RIAPERTURA_DOPO_MS = 30 * 60 * 1000
/* Revisione del Desktop R3: le cartelle dove si è già giudicata una scrittura hanno un tetto (la più vecchia esce). */
const RADICI_RICORDATE = 64

const stato = { nati: 0, giudizi: 0, riscaldamenti: 0, ripieghi: 0, cadute: 0, tempiScaduti: 0, ultimoErrore: null, spento: false, spentoAt: null }
let corrente = null
const radiciScritte = new Set()

const codiceDellErrore = (e) => (typeof e?.code === 'string' && /^[A-Z0-9_]{2,64}$/u.test(e.code) ? e.code : 'errore-interno')

function contaCaduta(motivo) {
    stato.cadute += 1
    if (motivo) stato.ultimoErrore = motivo
    if (stato.cadute >= CADUTE_MASSIME && !stato.spento) {
        stato.spento = true
        stato.spentoAt = Date.now()
        console.warn(`[talos] write check worker off for ${RIAPERTURA_DOPO_MS / 60_000} min after ${stato.cadute} failures (${stato.ultimoErrore ?? 'unknown'}): writes are checked on the main thread meanwhile`)
    }
}

/** Il SOLO punto che decide se il worker si usa (Mobile 30/10: su `android` no, e la condizione si sposta qui quando il compilatore
 *  arriverà sul telefono). */
export function cancelloWorkerAmmesso({ piattaforma = process.platform, ambiente = process.env, ora = Date.now() } = {}) {
    if (piattaforma === 'android') return false
    if (String(ambiente?.TALOS_CANCELLO_WORKER ?? '').trim() === '0') return false
    if (stato.spento && ora - stato.spentoAt >= RIAPERTURA_DOPO_MS) Object.assign(stato, { spento: false, spentoAt: null, cadute: 0 })
    return !stato.spento
}

/* Il tetto della memoria del worker, legato a quello del cancello: la cache tiene fino a `tettoCancello()` byte di sorgenti, e un
   costruttore costa 130–570 volte i byte del testo (misura del 29/10 nel commento di `tettoCancello`); più il compilatore stesso. */
/* ⛔ Misurato il 30/10 (Node 24, scratchpad tetto-worker.mjs): con 1 MB V8 non riesce nemmeno ad avviare il worker e ABORTISCE IL
   PROCESSO INTERO («Fatal JavaScript out of memory: GC during deserialization» — la documentazione di `resourceLimits` lo avverte:
   «the process may still abort if it encounters a global out-of-memory situation»); con 4 MB muore solo il worker
   (ERR_WORKER_OUT_OF_MEMORY); con 16 MB giudica un progetto piccolo. ⇒ Nessun valore sotto 4 MB, nemmeno chiesto. */
export const MEMORIA_MINIMA_WORKER_MB = 4
export function limiteMemoriaWorkerMb({ ambiente = process.env } = {}) {
    const chiesto = String(ambiente?.TALOS_CANCELLO_WORKER_MB ?? '').trim()
    if (/^\d{1,5}$/.test(chiesto) && Number(chiesto) > 0) return Math.max(MEMORIA_MINIMA_WORKER_MB, Number(chiesto))
    const tetto = tettoCancello({ ambiente })
    return Math.min(2048, Math.max(256, Math.ceil((tetto * 600) / 2 ** 20) + 256))
}

function nasci(cartelleLib) {
    /* ⛔ Sempre l'ingresso accanto a questo modulo, mai un percorso dall'ambiente (revisione della CLI 30/10: una variabile che sceglie
       il file del worker è un gancio che ESEGUE codice con i diritti del processo, e un ospite che caricasse il `.env` di un progetto
       trasformerebbe «apri questo repo» in «esegui questo file»). Chi impacchetta mette `cancello-worker.mjs` accanto al nucleo. */
    const worker = new Worker(PERCORSO_DEL_CANCELLO_WORKER, {
        workerData: { cartelleLib },
        resourceLimits: { maxOldGenerationSizeMb: limiteMemoriaWorkerMb() },
    })
    const c = { worker, pendenti: new Map(), prossimo: 0, sveglia: null, chiusoDaNoi: false }
    worker.unref()
    worker.on('message', (m) => {
        const p = c.pendenti.get(m?.id)
        if (!p) return
        c.pendenti.delete(m.id)
        p.fine(m.rotta ? { rotta: m.rotta } : { esito: m.esito })
    })
    /* solo il CODICE dell'errore (nota del Desktop 30/10): il messaggio grezzo può portare un percorso locale fino al JSON del Doctor e
       a «Segnala un problema» */
    worker.on('error', (e) => { stato.ultimoErrore = codiceDellErrore(e) })
    worker.on('exit', () => {
        if (corrente === c) corrente = null
        if (c.sveglia) clearTimeout(c.sveglia)
        for (const p of c.pendenti.values()) p.fine(null)
        c.pendenti.clear()
        if (!c.chiusoDaNoi) contaCaduta(null)
    })
    stato.nati += 1
    return c
}

function chiudi(c) {
    if (!c || c.chiusoDaNoi) return
    c.chiusoDaNoi = true
    if (corrente === c) corrente = null
    c.worker.terminate().catch(() => {})
}

function richiesta(messaggio, cartelleLib) {
    if (!corrente) corrente = nasci(cartelleLib)
    const c = corrente
    const id = ++c.prossimo
    return new Promise((ok) => {
        let tetto = null
        const p = {
            chiusa: false,
            fine: (r) => {
                if (p.chiusa) return
                p.chiusa = true
                clearTimeout(tetto)
                c.pendenti.delete(id)
                if (c.pendenti.size === 0) {
                    c.worker.unref()
                    /* fermo da adesso: dopo `INATTIVITA_WORKER_MS` senza richieste se ne va, e con lui la memoria */
                    if (c.sveglia) clearTimeout(c.sveglia)
                    c.sveglia = setTimeout(() => chiudi(c), INATTIVITA_WORKER_MS)
                    c.sveglia.unref()
                }
                ok(r)
            },
        }
        /*
         * Revisione del Desktop R1 (30/10): allo scadere il worker NON resta vivo. Il lavoro del compilatore è sincrono, quindi un worker
         *   fermo su un giudizio fa aspettare in fila tutti i messaggi dopo: ogni scrittura successiva avrebbe aspettato a sua volta
         *   l'intero tempo e poi sarebbe ricaduta sul filo principale. Si chiude (le altre richieste in volo ricadono subito), conta
         *   come caduta, e la richiesta dopo fa nascere un worker nuovo.
         */
        tetto = setTimeout(() => {
            stato.tempiScaduti += 1
            p.fine(null)
            if (!c.chiusoDaNoi) { contaCaduta('timeout'); chiudi(c) }
        }, attesaMassimaMs())
        tetto.unref()
        if (c.sveglia) { clearTimeout(c.sveglia); c.sveglia = null }
        c.pendenti.set(id, p)
        c.worker.ref() // in volo: il processo non si chiude mentre aspetta l'esito
        c.worker.postMessage({ ...messaggio, id })
    })
}

/**
 * Il verdetto del cancello sul worker. `{ esito }` o `{ rotta: { message, codiceCancello } }` come la strada di prima li produrrebbe;
 * `null` = il worker non ha risposto (caduto, tetto della memoria, tempo scaduto): chi chiama giudica sulla strada di prima.
 */
export async function giudicaNelWorker({ radice, percorso, contenuto, cartelleLib = [] }) {
    let r = null
    try { r = await richiesta({ radice, percorso, contenuto }, cartelleLib) }
    catch (e) { stato.ultimoErrore = codiceDellErrore(e) }
    if (r) {
        stato.giudizi += 1
        radiciScritte.delete(radice) // in fondo: la più usata di recente esce per ultima
        radiciScritte.add(radice)
        while (radiciScritte.size > RADICI_RICORDATE) radiciScritte.delete(radiciScritte.values().next().value)
    }
    else stato.ripieghi += 1
    return r
}

/**
 * Il preriscaldamento (forma chiusa il 30/10 sera, regole scritte prima della misura): solo dove nel processo si è già giudicata una
 * scrittura di quella radice — la misura ha messo il costo a vuoto oltre le soglie (2,3–3,2 s di processore, +265–323 MB), quindi vale
 * la regola della CLI «solo dopo la prima scrittura». Mai un'attesa: chi chiama non aspetta niente.
 */
export function scaldaIlCancello(radice, { cartelleLib = [], piattaforma = process.platform, ambiente = process.env } = {}) {
    if (typeof radice !== 'string' || !radice || !radiciScritte.has(radice)) return false
    if (!cancelloWorkerAmmesso({ piattaforma, ambiente })) return false
    stato.riscaldamenti += 1
    richiesta({ radice, scalda: true }, cartelleLib).catch(() => {})
    return true
}

/** Per le prove e per la diagnosi: quante volte il worker è nato, ha giudicato, è caduto, e se il processo l'ha spento. */
export function statoCancelloWorker() {
    return { ...stato, vivo: Boolean(corrente), radiciScritte: radiciScritte.size }
}

/** Per le prove: chiude il worker e azzera i conti. */
export async function azzeraCancelloWorker() {
    const c = corrente
    if (c) { c.chiusoDaNoi = true; corrente = null; await c.worker.terminate().catch(() => {}) }
    Object.assign(stato, { nati: 0, giudizi: 0, riscaldamenti: 0, ripieghi: 0, cadute: 0, tempiScaduti: 0, ultimoErrore: null, spento: false, spentoAt: null })
    radiciScritte.clear()
}
