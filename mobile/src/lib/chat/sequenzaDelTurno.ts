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
    /**
     * Il suo risultato è arrivato (Codice r4, `ToolCallResult`). ⛔ Owner 22/10/2026 («guarda che casino»): senza testo fra una
     * chiamata e l'altra r4 le mette tutte nello stesso confine, e una chiamata finita restava «in corso» col suo orologio. Assente
     * (la chat, il salvato) vale la regola del confine, come prima.
     */
    finita?: true
    /**
     * ESITO-RIGA (Pad, 27/10/2026): com'è andata, quando non è andata — la decisione del PC (`esitoAttrezzoR4.ts`). Assente =
     * riuscita. Resta nel salvato: la riga rossa deve reggere al ricaricamento.
     */
    esito?: TalosEsitoAttrezzo
    /**
     * T8 (27/10/2026): il corpo della riga che si apre, come sul PC — gli argomenti grezzi (JSON) e il risultato. Solo il Codice r4
     * li mette, e solo in memoria (la conversazione si rifà dagli eventi di r4); la chat non li salva.
     */
    argomenti?: string
    risultato?: TalosRisultatoAttrezzo
}

/** T8: il risultato di una chiamata: il testo del kernel e, solo se il backend li ha davvero, i due flussi. */
export interface TalosRisultatoAttrezzo {
    contenuto: string
    stdout?: string
    stderr?: string
}

/** Gli stati del PC (`impostaEsitoRiga`): error, interrupted, not-run, duplicate. */
export type TalosEsitoAttrezzo = 'errore' | 'interrotta' | 'non-eseguita' | 'doppione'
const ESITI_ATTREZZO: readonly unknown[] = ['errore', 'interrotta', 'non-eseguita', 'doppione'] satisfies TalosEsitoAttrezzo[]

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

function risultatoValido(valore: unknown): valore is TalosRisultatoAttrezzo {
    if (!valore || typeof valore !== 'object') return false
    const { contenuto, stdout, stderr } = valore as Record<string, unknown>
    return typeof contenuto === 'string' && (stdout === undefined || typeof stdout === 'string') && (stderr === undefined || typeof stderr === 'string')
}

function risultatoPulito({ contenuto, stdout, stderr }: TalosRisultatoAttrezzo): TalosRisultatoAttrezzo {
    return { contenuto, ...(stdout ? { stdout } : {}), ...(stderr ? { stderr } : {}) }
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
                segmenti.push({ tipo, attrezzi: validi.map(({ name, detail, esito, argomenti, risultato }) => ({
                    name, detail: detail ?? null, ...(ESITI_ATTREZZO.includes(esito) ? { esito } : {}),
                    // T8: il corpo passa solo nella sua forma (testi); storto si lascia, la riga resta
                    ...(typeof argomenti === 'string' && argomenti ? { argomenti } : {}),
                    ...(risultatoValido(risultato) ? { risultato: risultatoPulito(risultato) } : {}),
                })) })
            }
        } else {
            return null
        }
    }
    return segmenti.length ? segmenti : null
}

/**
 * ⛔ Owner 20/10/2026 (difetto 2 delle righe degli attrezzi, foto dal Pad): con tante chiamate le righe occupano troppo spazio.
 * Da questa soglia in su le righe CONSECUTIVE diventano un gruppo con una riga di riassunto che si apre al tocco (Hermes
 * `apps/desktop/src/components/assistant-ui/tool/fallback.tsx:1012`, che raggruppa da 2; Codex `exec_cell/render.rs:318`).
 * Tre: due righe non pesano, e il riassunto di due nasconderebbe più di quanto risparmia. Scelta da confermare con l'owner.
 */
export const TALOS_SOGLIA_GRUPPO_ATTREZZI = 3

export interface TalosRigaDelBlocco {
    attrezzo: TalosAttrezzoDelGiro
    inCorso: boolean
}

/** Una voce di un blocco di passi, nell'ordine in cui è successa: un attrezzo o un ragionamento fra due attrezzi. */
export type TalosVoceDelBlocco =
    | { tipo: 'attrezzo'; riga: TalosRigaDelBlocco }
    | { tipo: 'ragionamento'; testo: string }

export type TalosBloccoDelTurno =
    | { tipo: 'ragionamento'; testo: string }
    | { tipo: 'testo'; testo: string }
    /** `righe`: solo gli attrezzi (si contano e si riassumono); `voci`: attrezzi E ragionamenti in ordine (si disegnano). */
    | { tipo: 'attrezzi'; righe: TalosRigaDelBlocco[]; voci: TalosVoceDelBlocco[] }

/**
 * I blocchi da disegnare. ⛔ DECISIONE OWNER 22/10/2026 («Ragionamento dentro il gruppo», supera quella del 09/10): i passi senza
 * testo per la persona — attrezzi e ragionamenti fra un attrezzo e l'altro — diventano UN blocco, e il ragionamento ci sta dentro al
 * suo posto (ordine cronologico all'apertura). Solo il testo per la persona spezza il blocco. Un ragionamento che non tocca nessun
 * attrezzo resta da solo. Ogni riga si porta dietro se è «in corso» (`inCorso(indice del segmento)`), perché in un blocco possono
 * stare insieme le righe chiuse dei giri prima e quelle vive dell'ultimo.
 */
export function talosBlocchiDelTurno(
    segmenti: readonly TalosSegmentoDelTurno[],
    inCorso: (indice: number) => boolean,
): TalosBloccoDelTurno[] {
    const blocchi: TalosBloccoDelTurno[] = []
    /** I ragionamenti arrivati dopo un testo (o all'inizio): entrano nel blocco se segue un attrezzo, altrimenti restano da soli. */
    let inAttesa: string[] = []
    const scarica = () => {
        for (const testo of inAttesa) blocchi.push({ tipo: 'ragionamento', testo })
        inAttesa = []
    }
    segmenti.forEach((segmento, indice) => {
        const ultimo = blocchi[blocchi.length - 1]
        if (segmento.tipo === 'testo') {
            scarica()
            blocchi.push(segmento)
            return
        }
        if (segmento.tipo === 'ragionamento') {
            // subito dopo dei passi: è un passo anche lui (àncora: ragionamento-nel-blocco)
            if (ultimo?.tipo === 'attrezzi' && inAttesa.length === 0) ultimo.voci.push({ tipo: 'ragionamento', testo: segmento.testo })
            else inAttesa.push(segmento.testo)
            return
        }
        const vivo = inCorso(indice)
        // una chiamata col risultato già arrivato non è in corso, anche nell'ultimo confine di un giro vivo (owner 22/10)
        const righe = segmento.attrezzi.map((attrezzo) => ({ attrezzo, inCorso: vivo && attrezzo.finita !== true }))
        const voci: TalosVoceDelBlocco[] = righe.map((riga) => ({ tipo: 'attrezzo', riga }))
        if (ultimo?.tipo === 'attrezzi' && inAttesa.length === 0) {
            ultimo.righe.push(...righe)
            ultimo.voci.push(...voci)
            return
        }
        // i ragionamenti in attesa precedono questi attrezzi: aprono il blocco (àncora: ragionamento-apre-il-blocco)
        blocchi.push({ tipo: 'attrezzi', righe, voci: [...inAttesa.map((testo) => ({ tipo: 'ragionamento' as const, testo })), ...voci] })
        inAttesa = []
    })
    scarica()
    return blocchi
}
