/*
 * ⭐ L1 1.2 del motore locale (owner 26/10/2026: «il metodo migliore… never break user space», poi «Sì, tutte e due») — IL REGISTRO
 *   DEI TENTATIVI: il freno guarda l'ESITO, non la chiamata.
 *
 * Il caso: Granite 4.2 3B sul Pad (22/10, sessione 873b87ed, 16 minuti). Misurato sul trascritto (handoff
 *   `RICERCA-FRENO-CICLI-2026-10-26.md` §6): 29 scritture, 20 rimettono un contenuto GIÀ scritto, e `node test.js` dà 5 volte su 5
 *   «TypeError: somma is not a function». La guardia di oggi (`creaGuardiaGiriInTondo`, `talosHarness.mjs:600-618`) azzera tutto a
 *   ogni scrittura riuscita (`:614`), compresa la voce della scrittura stessa: ogni copia identica conta di nuovo «1». Nessuno dei 12
 *   concorrenti letti nel codice la ferma (Hermes `agent/tool_guardrails.py:425`: una scrittura riuscita è progresso; Gemini, Roo,
 *   Kilo, Cline, Qwen, Goose, Crush contano l'INGRESSO, nome + argomenti).
 * ⇒ Qui un tentativo è progresso solo se cambia qualcosa di OSSERVABILE:
 *   - una verifica (`shell`, `prova`) che FALLISCE con lo stesso esito di prima, dopo delle scritture, è un tentativo stagnante;
 *   - un esito NUOVO di una verifica azzera tutto (rosso diverso, meno test falliti, verde, o un comando mai visto).
 * Contatori: A = tentativi stagnanti di fila; B = «ritorni» di fila — un tentativo stagnante fatto SOLO di versioni già provate, o una
 *   copia identica dello stesso file scritta subito dopo sé stessa (nient'altro in mezzo). Soglie del contratto
 *   (`CONTRATTO-FRENO-CICLI-2026-10-26.md`): nota con A≥3 o B≥2, fermata con B≥5 o A≥8 (8 e non 5 quando il codice cambia davvero:
 *   non si interrompe un debugging vero).
 * ⛔ Fase 1 (contratto con la CLI, 26/10): il registro è dietro un interruttore SUO (`registroTentativi`, spento di serie), dà la nota
 *   al modello e la fermata la REGISTRA soltanto (ombra): si accende dopo la misura sulle sessioni salvate. La guardia delle chiamate
 *   identiche di oggi non cambia (CLI: `s59-going-round-in-circles`, `duplicate-call-row.test.ts:69`).
 * ⛔ Revisione avversaria del 26/10 (VERDE CON RISERVE), curate qui:
 *   R2 — una copia identica di un file ACCESSORIO a ogni tentativo, mentre il codice cambia davvero, alzava B a ogni copia: fermata al
 *        5° invece che all'8°. Ora una copia conta da sola solo se segue SUBITO la stessa copia; dentro un tentativo conta B solo se
 *        TUTTE le scritture erano ritorni.
 *   R3 — un `grep` che non trova più niente esce 1, sempre uguale: «Your edits are not reaching the cause» su lavoro sano. Ora fallisce
 *        solo un esito con una riga d'errore.
 *   R4 — si riconosceva solo `mode:"append"`; il kernel accetta anche `append:true`, `modalita:"accoda"`, `mode:"add"`: ora la tabella
 *        è quella del kernel (`modalitaDiScrittura`, passata da chi crea il registro). E la nota non dice più «Nothing changed on
 *        disk» (falso se la shell ha toccato il file in mezzo): dice ciò che è sempre vero, «lo stesso contenuto della scrittura prima».
 *   R5 — `node --test` stampa `duration_ms 52.06`: ogni corsa sembrava un esito nuovo. E un «429» qualunque nell'uscita la rendeva
 *        «di rete». Ora le durate di quel formato si tolgono e il 429 vale solo come stato HTTP.
 *   N5 — la nota ha un tetto (400 caratteri, contratto).
 * ⛔ Revisione blocco 2 (26/10), curate qui: R4 — fallisce un codice d'uscita diverso da 0 (non solo una riga d'errore in inglese),
 *   tranne l'1 dei comandi che rispondono così (`grep`, `diff`…); R5 — un tentativo che tocca solo file nuovi azzera (contratto:
 *   «una modifica ad ALTRI file»). Resta dichiarato N2: un andata e ritorno fra due versioni con due errori alternati non si vede.
 * ⛔ Limiti dichiarati: lo stato del file è una CATENA di impronte degli argomenti, non il file riletto dal disco — un andata e ritorno
 *   con `file_edit` (A→B, poi B→A) non risulta un ritorno (N6); la forma si ricorda per giro, non fra giri.
 */
import { createHash } from 'node:crypto'

export const NOTA_DA_STAGNANTI = 3
export const NOTA_DA_RITORNI = 2
export const FERMATA_DA_STAGNANTI = 8
export const FERMATA_DA_RITORNI = 5
export const NOTA_MASSIMA = 400
const VERSIONI_RICORDATE = 8
const ATTREZZI_DI_SCRITTURA = new Set(['scrivi', 'file_edit'])
const ATTREZZI_DI_VERIFICA = new Set(['shell', 'prova'])
/* Un esito che dipende dalla rete o dal tempo non dice niente sul codice: non conta mai come «uguale» (né come progresso). */
const TRANSITORIO = /\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|timed out|timeout of \d+|Too Many Requests|(?:HTTP|status|code)[ :=]*429)\b/iu

/* I comandi che escono 1 per dire «nessuna corrispondenza» o «diversi»: in una catena o in un tubo conta l'ultimo, e qui basta che
   compaia (approssimato apposta: sbagliare verso «non è un fallimento» toglie solo una nota, mai il lavoro). */
const RISPONDE_CON_UNO = /(?:^|[|;&(]\s*)(?:git\s+(?:grep|diff)|grep|egrep|fgrep|rg|findstr|select-string|diff|cmp|fc|test|\[)(?=\s|$)/iu
const impronta = (testo) => createHash('sha256').update(testo).digest('hex').slice(0, 16)
const normaTesto = (s) => String(s ?? '').replace(/\r\n?/gu, '\n').replace(/[ \t]+$/gmu, '').replace(/\n+$/u, '')
const tagliato = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function argomentiDi(argomenti) {
    if (argomenti && typeof argomenti === 'object') return argomenti
    try { return JSON.parse(String(argomenti ?? '{}')) } catch { return {} }
}

/* Senza la tabella del kernel (lo script di misura che non la passa, le prove pure) si riconosce la forma più comune. */
const modalitaMinima = (a) => (a?.append === true || ['append', 'add', 'accoda'].includes(String(a?.mode ?? a?.modalita ?? '').toLowerCase()) ? 'accoda' : 'nuovo')

/**
 * L'impronta dello STATO del file dopo una scrittura, e il file che tocca. Uno `scrivi` intero dà lo stato dal suo contenuto; un
 *   accodamento e un `file_edit` lo danno A CATENA dallo stato di prima (`statoPrima`, null se il file non è stato scritto in questo giro).
 * ⛔ Misurato sul trascritto di Granite: il modello alternava «riscrivi» e «aggiungi in coda» (88 ↔ 177 byte). Con l'impronta degli
 *   argomenti ogni scrittura sembrava nuova rispetto alla precedente; con la catena il ciclo torna su stati già visti.
 */
export function versioneDellaScrittura(nome, argomenti, statoPrima = null, modalita = modalitaMinima) {
    const a = argomentiDi(argomenti)
    const percorso = String(a.percorso ?? a.path ?? '').replace(/\\/gu, '/').replace(/^\.\//u, '')
    if (nome !== 'file_edit' && modalita(a) !== 'accoda') return { percorso, versione: impronta(`write\u0000${normaTesto(a.contenuto ?? a.content)}`) }
    const passo = nome === 'file_edit'
        ? `edit\u0000${normaTesto(a.old_string)}\u0000${normaTesto(a.new_string)}`
        : `append\u0000${normaTesto(a.contenuto ?? a.content)}`
    return { percorso, versione: impronta(`${statoPrima ?? `ignoto:${percorso}`}\u0000${passo}`) }
}

/** La chiave del comando di verifica e l'impronta del suo esito, senza ciò che cambia a ogni esecuzione. */
export function esitoDellaVerifica(nome, argomenti, esito) {
    const a = argomentiDi(argomenti)
    const comando = nome === 'prova' ? 'prova' : String(a.comando ?? a.command ?? '').trim().replace(/\s+/gu, ' ')
    const testo = String(esito ?? '')
    if (TRANSITORIO.test(testo)) return { comando, esito: null }
    const pulito = testo
        .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, '') // colori ANSI
        .replace(/<<<(?:END_)?TALOS_DATA id=[0-9a-f]+/gu, '<<<TALOS_DATA') // il confine dei dati ha un id nuovo a ogni chiamata
        .replace(/^\[TALOS[^\n]*$/gmu, '') // le righe di TALOS (note, «output reference: <uuid>») non sono l'esito del comando
        .replace(/\[TALOS:[^\]]*\]/gu, '')
        /* ⛔ Misurato sul trascritto di Granite: cinque esiti identici avevano cinque impronte diverse per l'uuid dell'«output
           reference» che TALOS stesso aggiunge. Ogni identificativo casuale si toglie. */
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, '<id>')
        .replace(/\b[0-9a-f]{12,}\b/giu, '<id>')
        .replace(/\bduration_ms\b[\s:=]*\d+(?:[.,]\d+)?/giu, 'duration_ms <t>') // R5: il riepilogo di `node --test` (TAP e spec)
        .replace(/\b\d+(?:[.,]\d+)?\s?(?:ms|s|sec|seconds|m|min)\b/giu, '<t>') // durate
        .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?\b/gu, '<ora>')
        .replace(/\b\d{1,2}:\d{2}:\d{2}\b/gu, '<ora>')
        .replace(/\b(?:pid|PID)[ :=]+\d+/gu, 'pid <n>')
        .replace(/[A-Za-z]:[\\/][^\s'"]*?\\Temp\\[^\s'"]+|\/tmp\/[^\s'"]+/gu, '<tmp>')
    const righe = normaTesto(pulito).split('\n')
    /* Revisione blocco 2 (R4): anche le righe d'errore della shell di Windows in italiano («non è riconosciuto come comando…»). */
    const primoErrore = righe.find((r) => /error|fail|✖|assert|exception|traceback|errore|non è riconosciuto|impossibile trovare/iu.test(r)) ?? ''
    const codice = (testo.match(/\b(?:exit(?:ed)?(?: with)?(?: code)?|codice d'uscita)[ :=]*(-?\d+)/iu) ?? [])[1] ?? ''
    /* R3 del blocco 1: un `grep` che non trova, un `diff` che trova differenze escono 1 ed è una RISPOSTA, non un fallimento.
       ⛔ R4 del blocco 2: chiedere per questo una riga d'errore in inglese toglieva i test che falliscono senza dirlo («wrong
       result, expected 3», exit 1) — 133 uscite diverse da 0 su 452 nelle sessioni salvate. Ora fallisce: un codice diverso da 0,
       tranne l'1 senza riga d'errore dei comandi che rispondono così; oppure, senza codice, una riga d'errore. */
    const fallisce = codice === '' ? primoErrore !== '' : codice !== '0' && !(codice === '1' && primoErrore === '' && RISPONDE_CON_UNO.test(comando))
    return { comando, esito: impronta(`${codice}\u0000${primoErrore}\u0000${righe.slice(-20).join('\n')}`), primoErrore: tagliato(primoErrore.trim(), 160), fallisce }
}

/**
 * Il registro di UN giro (una richiesta della persona: il messaggio dopo ne apre uno nuovo).
 * `osserva` torna `{ livello, nota, A, B, motivo }`: livello 0 niente, 1 nota al modello, 3 fermata (in fase 1 solo registrata).
 * @param {{ modalitaDiScrittura?: (argomenti: object) => string|null }} [opzioni] la tabella dei modi di scrittura del kernel
 */
export function creaRegistroTentativi({ modalitaDiScrittura = modalitaMinima } = {}) {
    const modalita = (a) => modalitaDiScrittura(a) ?? 'nuovo'
    const versioni = new Map() // percorso → ultime versioni (la più recente in fondo)
    const ultimoEsito = new Map() // comando → impronta dell'ultimo esito non transitorio
    const scrittureDa = new Map() // comando → scritture dall'ultima esecuzione: [{ percorso, ritorno, contata }]
    let percorsiTentati = new Set() // i file scritti dall'ultimo esito nuovo in poi (revisione blocco 2, R5)
    let ultimaChiamata = null // { tipo: 'scrittura', percorso, versione } | { tipo: 'altro' }
    let A = 0
    let B = 0
    let ultimoLivello = 0
    let ultimaNotaA = 0
    let ultimaNotaB = 0
    let ultimoErrore = ''

    const azzera = () => { A = 0; B = 0; ultimoLivello = 0; ultimaNotaA = 0; ultimaNotaB = 0 }
    const livello = () => (B >= FERMATA_DA_RITORNI || A >= FERMATA_DA_STAGNANTI ? 3 : B >= NOTA_DA_RITORNI || A >= NOTA_DA_STAGNANTI ? 1 : 0)
    const fermo = () => ({ livello: livello(), nota: null, A, B })

    function esitoDelLivello(dettaglio) {
        const l = livello()
        let nota = null
        /* La nota esce quando si entra nel livello e poi ogni due passi in più: un modello piccolo la ignora se arriva sempre uguale,
           e una nota a ogni chiamata gonfierebbe il contesto. */
        if (l >= 1 && (ultimoLivello < 1 || A - ultimaNotaA >= 2 || B - ultimaNotaB >= 2 || (l === 3 && ultimoLivello < 3))) {
            nota = tagliato(dettaglio, NOTA_MASSIMA - 1) // «sotto i 400» (contratto): al più 399
            ultimaNotaA = A
            ultimaNotaB = B
        }
        ultimoLivello = Math.max(ultimoLivello, l)
        return { livello: l, nota, A, B, ...(l === 3 ? { motivo: B >= FERMATA_DA_RITORNI ? 'ritorni' : 'stagnanti' } : {}) }
    }
    const conErrore = () => (ultimoErrore ? ` ("${ultimoErrore}")` : '')

    return {
        /** @param {{ nome: string, argomenti: unknown, esito: unknown, fallito?: boolean }} chiamata */
        osserva({ nome, argomenti, esito, fallito = false }) {
            if (ATTREZZI_DI_SCRITTURA.has(nome)) {
                if (fallito) { ultimaChiamata = { tipo: 'altro' }; return fermo() }
                const { percorso } = versioneDellaScrittura(nome, argomenti, null, modalita)
                const viste = versioni.get(percorso) ?? [] // l'ultima è lo stato attuale del file
                const { versione } = versioneDellaScrittura(nome, argomenti, viste.at(-1) ?? null, modalita)
                const ritorno = viste.includes(versione)
                /* R2: un ritorno conta da solo solo se la chiamata di PRIMA era una scrittura dello STESSO file — nient'altro in mezzo,
                   né un controllo né un altro file. Così la copia di un file accessorio fra due modifiche vere non conta, e l'avanti e
                   indietro di Granite sullo stesso file (riscrivi / aggiungi in coda / riscrivi, 88 ↔ 177 byte) sì. */
                const copiaDiFila = ultimaChiamata?.tipo === 'scrittura' && ultimaChiamata.percorso === percorso && ritorno
                versioni.set(percorso, [...viste.filter((v) => v !== versione), versione].slice(-VERSIONI_RICORDATE))
                ultimaChiamata = { tipo: 'scrittura', percorso, versione }
                for (const elenco of scrittureDa.values()) elenco.push({ percorso, ritorno, contata: copiaDiFila })
                if (!copiaDiFila) return fermo()
                B += 1
                return esitoDelLivello(`[TALOS: "${tagliato(percorso, 80)}" was written back to a content you already wrote before, with nothing else in between (${B} times now with no new result). Re-read the error${conErrore()} and change the approach, or say what blocks you.]`)
            }
            ultimaChiamata = { tipo: 'altro' }
            if (!ATTREZZI_DI_VERIFICA.has(nome)) return fermo()
            const { comando, esito: impronta, primoErrore, fallisce } = esitoDellaVerifica(nome, argomenti, esito)
            if (!comando || impronta === null) return fermo() // transitorio: non dice niente sul codice
            const prima = ultimoEsito.get(comando)
            const scritture = scrittureDa.get(comando) ?? []
            ultimoEsito.set(comando, impronta)
            scrittureDa.set(comando, [])
            if (prima !== impronta) { // esito nuovo: progresso
                azzera()
                ultimoErrore = primoErrore ?? ''
                percorsiTentati = new Set(scritture.map((s) => s.percorso))
                return { livello: 0, nota: null, A, B }
            }
            if (scritture.length === 0) return fermo() // stesso comando senza cambi: si ripete o si aspetta, non è un tentativo
            /* ⛔ Misurato sulle 133 sessioni vere della CLI (26/10): l'unico allarme era un modello che dopo ogni modifica rilanciava
               comandi che RIUSCIVANO (exit 0). Ripetere una verifica che passa non è un ciclo: lo stallo è un FALLIMENTO che resta uguale. */
            if (!fallisce) return fermo()
            /* ⛔ Revisione blocco 2 (R5): un refactor su otto file DIVERSI con un rosso vecchio che il lavoro non tocca riceveva
               «Your edits are not reaching the cause». Il contratto lo dice: una modifica ad ALTRI file azzera. Un tentativo conta
               solo se rimette mano a un file già toccato dall'ultimo esito nuovo in poi; se tocca soltanto file nuovi, si riparte. */
            const toccati = [...new Set(scritture.map((s) => s.percorso))]
            const giaTentato = percorsiTentati.size === 0 || toccati.some((p) => percorsiTentati.has(p)) // il primo tentativo dopo un esito senza scritture conta
            for (const p of toccati) percorsiTentati.add(p)
            if (!giaTentato) { azzera(); return fermo() }
            A += 1
            if (scritture.every((s) => s.ritorno) && !scritture.every((s) => s.contata)) B += 1
            ultimoErrore = primoErrore ?? ultimoErrore
            return esitoDelLivello(`[TALOS: "${tagliato(comando, 80)}" gave the same failure after your changes ${A} times in a row${primoErrore ? `: "${primoErrore}"` : ''}. Your edits are not reaching the cause: read the full error and the code it points to, then try a different fix, or say what blocks you.]`)
        },
        stato: () => ({ A, B, livello: livello() }),
    }
}
