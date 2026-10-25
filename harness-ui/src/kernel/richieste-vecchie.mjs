/*
 * ⛔⛔ LE RICHIESTE VECCHIE DELLA PERSONA SI ACCORCIANO PER IL MODELLO, MAI PER LEI — regola K del §4.2 (decisione dell'owner del
 *   22/10/2026, presa nella sessione della CLI: «i messaggi lunghi già inviati e risposti si accorciano per il modello, tenendo inizio e
 *   fine, e il testo intero resta in un file che il modello può leggere»).
 *
 * Il caso misurato dalla CLI (`review613-5/gap1300`, `paste-overflow`): un log incollato due richieste fa restava alla lettera nella
 *   coda e fra le richieste tenute, e nessun riassunto poteva toccarlo (sta nel pavimento). La regola del riassunto rifiutava giusto,
 *   e la conversazione scivolava fino al rifiuto del fornitore.
 *
 * Stato dell'arte, alla fonte:
 * - Codex (`codex-rs/core/src/compact.rs:64`, `COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000`, e `:715-799`): percorre le richieste dalla
 *   più nuova con un budget di 20.000 token; quella che sfora si tronca al budget rimasto, le più vecchie si BUTTANO.
 * - cline (`sdk/packages/core/src/extensions/context/project.ts:551-590`): tronca il mezzo, perso.
 * ⇒ One-up: si tiene inizio e fine di OGNI richiesta oltre il budget (la forma della prima richiesta: `PRIMA_RICHIESTA_INIZIO/FINE`,
 *   6.000 + 2.000 caratteri) e il testo intero va in un file della sessione che `leggi` apre senza chiedere, con l'indicazione esatta
 *   di dove riprendere — come la pagina web salvata (`pagina-web-tagliata.mjs`). Il modello non perde niente.
 * ⇒ Il budget: min(20.000 token, 15% della finestra, o della soglia/0,75 senza finestra) — Codex usa 20k su finestre da 200k+; su
 *   un modello locale da 16k i 20k sarebbero più della finestra.
 * ⛔ L'ultima richiesta NON si tocca qui (regola N: mai accorciata in silenzio).
 * ⛔ Solo nella proiezione: la storia grezza resta intera (decisione 3).
 * ⛔ Il nome del file viene dall'impronta del testo: lo stesso messaggio dà lo stesso file e la stessa proiezione, byte per byte, a ogni
 *   compattazione (la cache del prompt del fornitore non si azzera per niente).
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { testaECodaDellaPagina } from './pagina-web-tagliata.mjs'

export const TETTO_RICHIESTE_VECCHIE_TOKEN = 20_000
export const FRAZIONE_RICHIESTE_VECCHIE_SULLA_FINESTRA = 0.15

const positivo = (n) => Number.isFinite(n) && n > 0

/** Il budget delle richieste vecchie: min(20.000 token, 15% della finestra — o della soglia / 0,75 senza finestra dichiarata). */
export function tettoRichiesteVecchie({ finestraToken = null, soglia = null, frazioneFinestra = 0.75 } = {}) {
    const finestra = positivo(finestraToken) ? finestraToken : positivo(soglia) ? soglia / frazioneFinestra : null
    return finestra === null ? TETTO_RICHIESTE_VECCHIE_TOKEN : Math.min(TETTO_RICHIESTE_VECCHIE_TOKEN, Math.floor(finestra * FRAZIONE_RICHIESTE_VECCHIE_SULLA_FINESTRA))
}

/** Il nome del file: l'impronta del testo. Stesso messaggio, stesso file, stessa proiezione. */
export function nomeDellaRichiestaSalvata(testo) {
    return `richiesta-${createHash('sha256').update(String(testo)).digest('hex').slice(0, 16)}.txt`
}


/* La copia intera nella cartella della sessione: percorso assoluto, o `null` se non si è potuta scrivere (l'accorciamento si fa lo
   stesso e la nota lo dice). Il nome è l'impronta: se il file c'è già con la stessa lunghezza non si riscrive (stessa sessione, stesso
   messaggio, compattazione dopo); altrimenti temporaneo nuovo (`wx`) e `rename`, come la pagina web salvata. */
export async function salvaRichiestaIntera(cartella, testo) {
    if (typeof cartella !== 'string' || cartella === '') return null
    const finale = join(cartella, nomeDellaRichiestaSalvata(testo))
    try {
        const info = await lstat(finale)
        if (info.isFile() && info.nlink === 1 && info.size === Buffer.byteLength(testo, 'utf8')) return finale
    } catch { /* non c'è ancora: si scrive */ }
    const temporaneo = join(cartella, `.${randomUUID()}.tmp`)
    try {
        await mkdir(cartella, { recursive: true })
        await writeFile(temporaneo, testo, { encoding: 'utf8', flag: 'wx' })
        await rename(temporaneo, finale)
        return finale
    } catch {
        await rm(temporaneo, { force: true }).catch(() => {})
        return null
    }
}

/* Ciò che il modello riceve: l'avviso in testa (B-02), l'inizio, il segno del taglio, la fine. Inizio e fine: la forma della prima
   richiesta (6.000 + 2.000 caratteri), sui confini di riga come la pagina web. */
export const MARCATORE_RICHIESTA_ACCORCIATA = '[TALOS shortened this earlier message from the person for the model:'
export function richiestaAccorciataPerIlModello(testo, percorsoSalvato, { inizio = 6_000, fine = 2_000 } = {}) {
    const { testa, coda, riprendi } = testaECodaDellaPagina(testo, inizio + fine, inizio / (inizio + fine))
    const misura = `${MARCATORE_RICHIESTA_ACCORCIATA} ${testo.length} characters, showing ${testa.length} at the start and ${coda.length} at the end. You already answered it in full.`
    const come = typeof percorsoSalvato !== 'string'
        ? ' The full text could not be saved, so the omitted middle cannot be read.]'
        : riprendi.offset !== undefined
            ? ` The full text is saved at "${percorsoSalvato}". Read the omitted middle with leggi percorso="${percorsoSalvato}" offset=${riprendi.offset}.]`
            : ` The full text is saved at "${percorsoSalvato}". Read the omitted middle with leggi percorso="${percorsoSalvato}" byteOffset=${riprendi.byteOffset}.]`
    const tolti = testo.length - testa.length - coda.length
    return `${misura}${come}\n${testa}\n\n[… ${tolti} characters omitted here: see the note at the top …]\n\n${coda}`
}

/* Regola N (§4.2, «Invia come allegato»): la richiesta NUOVA che non entra parte con la stessa forma — inizio, fine e il file intero —
   ma l'avviso dice il vero: il modello non l'ha mai vista per intero, e la parte tolta la legge lui prima di rispondere se gli serve.
   Senza file salvato non si manda (chi chiama rifiuta il giro: la persona non perde il mezzo senza saperlo). */
export const MARCATORE_RICHIESTA_ALLEGATA = '[TALOS sent this message from the person as an attachment:'
export function richiestaAllegataPerIlModello(testo, percorsoSalvato, { inizio = 6_000, fine = 2_000 } = {}) {
    const { testa, coda, riprendi } = testaECodaDellaPagina(testo, inizio + fine, inizio / (inizio + fine))
    const misura = `${MARCATORE_RICHIESTA_ALLEGATA} it is ${testo.length} characters, too long for this model's window, so you see ${testa.length} at the start and ${coda.length} at the end.`
    const come = riprendi.offset !== undefined
        ? ` The full text is saved at "${percorsoSalvato}". Read the omitted middle with leggi percorso="${percorsoSalvato}" offset=${riprendi.offset} when the answer depends on it.]`
        : ` The full text is saved at "${percorsoSalvato}". Read the omitted middle with leggi percorso="${percorsoSalvato}" byteOffset=${riprendi.byteOffset} when the answer depends on it.]`
    const tolti = testo.length - testa.length - coda.length
    return `${misura}${come}\n${testa}\n\n[… ${tolti} characters omitted here: see the note at the top …]\n\n${coda}`
}

/**
 * IL PIANO (sincrono): le richieste vecchie della persona dentro il budget, dalla più nuova (Codex `compact.rs:715-799`). Si sommano
 * le loro stime; quella che sfora il budget e tutte le più vecchie si accorciano, se sono più lunghe di `caratteriMassimi` (accorciarne
 * una corta non toglie niente; 9.000 tiene fuori anche la prima richiesta già tagliata a 6.000 + 2.000 dalla compattazione). L'ULTIMA
 * richiesta della persona — quella del giro in corso — non si conta e non si tocca mai (regola N). `eRichiesta(m)` la decide il
 * chiamante (le note del kernel non sono richieste). Il percorso di ogni copia intera viene dall'impronta del testo, quindi la
 * proiezione accorciata si conosce SUBITO, senza aspettare il disco: il registro la usa per decidere in modo sincrono; chi applica
 * davvero chiama `limitaRichiesteVecchie`, che scrive i file.
 * Ritorna i messaggi nuovi (stessa lunghezza, stesso ordine), quanti sono accorciati, e le copie da scrivere `{ indice, percorso, testo }`.
 */
export function pianoRichiesteVecchie(messaggi, { budgetToken, cartella = null, eRichiesta, stima, caratteriMassimi = 9_000 } = {}) {
    const lista = Array.isArray(messaggi) ? messaggi : []
    const indici = []
    for (let i = 0; i < lista.length; i += 1) if (eRichiesta(lista[i])) indici.push(i)
    const vecchie = indici.slice(0, -1) // l'ultima richiesta è del giro in corso: regola N
    const nuova = lista.slice()
    const daSalvare = []
    let somma = 0
    let oltre = false
    for (let k = vecchie.length - 1; k >= 0; k -= 1) {
        const i = vecchie[k]
        const m = lista[i]
        somma += stima([m])
        if (!oltre && somma <= budgetToken) continue
        oltre = true
        const testo = testoSemplice(m)
        if (testo === null || testo.length <= caratteriMassimi || testo.startsWith(MARCATORE_RICHIESTA_ACCORCIATA)
            || testo.startsWith(MARCATORE_RICHIESTA_ALLEGATA)) continue
        const percorso = typeof cartella === 'string' && cartella !== '' ? join(cartella, nomeDellaRichiestaSalvata(testo)) : null
        nuova[i] = { ...m, content: richiestaAccorciataPerIlModello(testo, percorso) }
        daSalvare.push({ indice: i, percorso, testo, messaggio: m, accorciato: nuova[i] })
    }
    return { messaggi: nuova, accorciati: daSalvare.length, daSalvare }
}

/**
 * L'APPLICAZIONE (asincrona): il piano, e le copie intere scritte nella cartella della sessione. Una copia che non si scrive (disco
 * pieno, permessi, nessuna cartella) non promette una lettura che fallirebbe: quel messaggio dice che il mezzo non si può leggere.
 */
export async function limitaRichiesteVecchie(messaggi, opzioni = {}) {
    const piano = pianoRichiesteVecchie(messaggi, opzioni)
    const nuova = piano.messaggi
    const salvati = []
    for (const { indice, percorso, testo, messaggio } of piano.daSalvare) {
        const scritto = percorso === null ? null : await salvaRichiestaIntera(opzioni.cartella, testo)
        if (scritto) salvati.push(scritto)
        else nuova[indice] = { ...messaggio, content: richiestaAccorciataPerIlModello(testo, null) }
    }
    return { messaggi: nuova, accorciati: piano.accorciati, salvati }
}

/**
 * Le copie di un piano già applicato a una proiezione DIVISA (il registro decide in modo sincrono, poi scrive): si scrivono, e un
 * messaggio la cui copia non si è scritta si sostituisce — per identità, ovunque sia finito (mezzo, coda, richieste tenute) — con la
 * versione che dice che il mezzo non si legge.
 */
export async function scriviCopieDelPiano(parti, daSalvare, cartella) {
    const sostituti = new Map()
    for (const { percorso, testo, messaggio, accorciato } of Array.isArray(daSalvare) ? daSalvare : []) {
        const scritto = percorso === null ? null : await salvaRichiestaIntera(cartella, testo)
        if (!scritto) sostituti.set(accorciato, { ...messaggio, content: richiestaAccorciataPerIlModello(testo, null) })
    }
    if (sostituti.size === 0) return parti
    const via = (lista) => (Array.isArray(lista) ? lista.map((m) => sostituti.get(m) ?? m) : lista)
    return { ...parti, mezzo: via(parti.mezzo), coda: via(parti.coda), richiesteLetterali: via(parti.richiesteLetterali) }
}

/* Il testo di una richiesta: una stringa, o le sole parti di testo se tutte le parti sono testo (con immagini non si accorcia: la
   stima le conta a parte e il riassunto le toglie). Esportato per la regola N: una richiesta con immagini non si manda come allegato. */
export function testoSemplice(m) {
    if (typeof m?.content === 'string') return m.content
    if (Array.isArray(m?.content) && m.content.length > 0 && m.content.every((p) => p?.type === 'text' && typeof p.text === 'string')) {
        return m.content.map((p) => p.text).join('\n')
    }
    return null
}
