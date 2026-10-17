/**
 * ⭐⭐⭐ N13 — ragionamento, righe degli attrezzi e testo NELL'ORDINE in cui sono successi.
 *
 * Owner 02/10/2026, con la foto dal Pad: la riga «Ricerca sul web…» stava SOPRA il blocco «Ragionamento»; deve stare sotto il
 * ragionamento, o sotto il testo, tra una chiamata e l'altra. Decisioni del 09/10:
 * - le righe restano al loro posto anche a risposta finita e dopo il reload;
 * - un ragionamento per giro;
 * - solo l'ordine cronologico;
 * - le chat vecchie restano come sono.
 *
 * ## Il modello
 * Come PocketPal (`steps`, Message.tsx:340-385) e l'AI SDK (`parts`): una sequenza ordinata di segmenti nel messaggio. Il desktop la
 * tiene in un registro di eventi rigiocato al reload; la chat nativa salva righe di messaggio, quindi la sequenza sta nel metadata
 * del messaggio dell'assistente.
 *
 * ## Perché i «confini» e non i segmenti già pronti
 * Il pacchetto che l'app carica all'avvio ha pochissimo margine. Al boot lo store registra solo, a ogni giro di attrezzi, quanto
 * testo e quanto ragionamento erano già arrivati, e quali attrezzi partono: tre numeri e un elenco. Tutto il resto vive qui, in un
 * modulo che si carica quando serve: segmenti, riconciliazione, validazione.
 */

/** Un attrezzo del giro, con le stesse due cose della riga che lo mostra: il nome e il dettaglio (la pagina, la query). */
export interface TalosAttrezzoDelGiro {
    name: string
    detail: string | null
}

/** Dove finiva un giro: la lunghezza del testo e del ragionamento già arrivati quando sono partiti i suoi attrezzi. */
export interface TalosConfineDelGiro {
    testo: number
    ragionamento: number
    attrezzi: readonly TalosAttrezzoDelGiro[]
}

export type TalosSegmentoDelTurno =
    | { tipo: 'ragionamento'; testo: string }
    | { tipo: 'testo'; testo: string }
    | { tipo: 'attrezzi'; attrezzi: TalosAttrezzoDelGiro[] }

/** La chiave nel metadata del messaggio dell'assistente. */
export const TALOS_METADATA_SEQUENZA = 'talos_sequenza'

const NON_VUOTO = /\S/

/**
 * La sequenza intera: i giri chiusi dai confini, poi quello che è arrivato dopo l'ultimo (la coda).
 *
 * In ogni giro l'ordine è quello in cui il modello emette: ragionamento, testo, poi gli attrezzi che ha chiesto. Un pezzo vuoto non
 * diventa un blocco. Un confine oltre la lunghezza vera (il trasporto può azzerare il ragionamento e ricominciare) si legge come
 * «fino alla fine».
 */
export function talosSegmentiDaiConfini(
    confini: readonly TalosConfineDelGiro[],
    testo: string,
    ragionamento: string,
): TalosSegmentoDelTurno[] {
    const segmenti: TalosSegmentoDelTurno[] = []
    let daTesto = 0
    let daRagionamento = 0
    const aggiungiPezzi = (finoTesto: number, finoRagionamento: number) => {
        const fineRagionamento = Math.max(daRagionamento, Math.min(finoRagionamento, ragionamento.length))
        const fineTesto = Math.max(daTesto, Math.min(finoTesto, testo.length))
        const pezzoRagionamento = ragionamento.slice(daRagionamento, fineRagionamento)
        const pezzoTesto = testo.slice(daTesto, fineTesto)
        if (NON_VUOTO.test(pezzoRagionamento)) segmenti.push({ tipo: 'ragionamento', testo: pezzoRagionamento })
        if (NON_VUOTO.test(pezzoTesto)) segmenti.push({ tipo: 'testo', testo: pezzoTesto })
        daRagionamento = fineRagionamento
        daTesto = fineTesto
    }
    for (const confine of confini) {
        aggiungiPezzi(confine.testo, confine.ragionamento)
        // ⛔ SEQ-REG-PAD-01: un attrezzo senza nome (chiamata storta del modello) non diventa una riga vuota.
        const attrezzi = confine.attrezzi.filter(attrezzoValido).map((attrezzo) => ({ ...attrezzo }))
        if (attrezzi.length) segmenti.push({ tipo: 'attrezzi', attrezzi })
    }
    aggiungiPezzi(testo.length, ragionamento.length)
    return segmenti
}

const senzaSpazi = (testo: string) => testo.replace(/\s+/g, '')

/**
 * Quello che si salva nel messaggio, o `null` se il turno non ha avuto attrezzi: in quel caso il messaggio si mostra come oggi
 * (ragionamento sopra il testo) e non porta un dato in più.
 *
 * ⛔ Il testo salvato del messaggio resta la verità. Il ciclo può togliere un preambolo falso già mostrato («Sveglia annullata»
 * detto prima di un attrezzo senza effetto, agentLoop.ts): se i pezzi di testo non danno il testo finale (spazi a parte), i pezzi si
 * tolgono e il testo finale va in fondo, intero. Ragionamento e righe degli attrezzi restano al loro posto.
 */
export function talosSequenzaDaSalvare(
    confini: readonly TalosConfineDelGiro[],
    testo: string,
    ragionamento: string,
    testoFinale: string,
    pulisciRagionamento: (testo: string) => string,
): TalosSegmentoDelTurno[] | null {
    if (confini.length === 0) return null
    let segmenti = talosSegmentiDaiConfini(confini, testo, ragionamento)
    const pezziDiTesto = segmenti.filter((segmento) => segmento.tipo === 'testo').map((segmento) => segmento.testo).join('')
    if (senzaSpazi(pezziDiTesto) !== senzaSpazi(testoFinale)) {
        segmenti = segmenti.filter((segmento) => segmento.tipo !== 'testo')
        if (NON_VUOTO.test(testoFinale)) segmenti.push({ tipo: 'testo', testo: testoFinale })
    }
    const puliti: TalosSegmentoDelTurno[] = []
    for (const segmento of segmenti) {
        if (segmento.tipo !== 'ragionamento') {
            puliti.push(segmento)
            continue
        }
        const pulito = pulisciRagionamento(segmento.testo)
        if (NON_VUOTO.test(pulito)) puliti.push({ tipo: 'ragionamento', testo: pulito })
    }
    return puliti
}

const MASSIMO_SEGMENTI = 500

function attrezzoValido(valore: unknown): valore is TalosAttrezzoDelGiro {
    if (!valore || typeof valore !== 'object') return false
    const { name, detail } = valore as { name?: unknown; detail?: unknown }
    return typeof name === 'string' && NON_VUOTO.test(name) && (detail === null || detail === undefined || typeof detail === 'string')
}

/**
 * La sequenza riletta dal metadata, o `null`. Il metadata viene dal disco: dati storti non devono diventare interfaccia, e il
 * messaggio allora si mostra come oggi, col suo testo.
 *
 * ⛔ SEQ-REG-PAD-01 (Pad, 11/10/2026): un attrezzo storto dentro un giro si salta, non butta via la sequenza intera. Prima un solo
 * attrezzo senza nome faceva sparire tutte le righe del messaggio finito. Una forma sbagliata dell'elenco resta `null`.
 */
export function talosSequenzaDaMetadata(valore: unknown): TalosSegmentoDelTurno[] | null {
    if (!Array.isArray(valore) || valore.length === 0 || valore.length > MASSIMO_SEGMENTI) return null
    const segmenti: TalosSegmentoDelTurno[] = []
    for (const voce of valore) {
        if (!voce || typeof voce !== 'object') return null
        const { tipo, testo, attrezzi } = voce as { tipo?: unknown; testo?: unknown; attrezzi?: unknown }
        if ((tipo === 'ragionamento' || tipo === 'testo') && typeof testo === 'string') {
            segmenti.push({ tipo, testo })
        } else if (tipo === 'attrezzi' && Array.isArray(attrezzi)) {
            const validi = attrezzi.filter(attrezzoValido)
            if (validi.length) {
                segmenti.push({ tipo, attrezzi: validi.map((attrezzo) => ({ name: attrezzo.name, detail: attrezzo.detail ?? null })) })
            }
        } else {
            return null
        }
    }
    return segmenti.length ? segmenti : null
}
