import { talosResearchReplay, type TalosResearchEvent, type TalosResearchRun } from '@/lib/research/researchRun'

/**
 * Leggere un giornale che il telefono ha interrotto a meta' parola. (§3.1)
 *
 * `talosResearchReplay` e' aritmetica su una lista di eventi e non sbaglia mai.
 * Il punto fragile sta un passo prima: qualcuno deve trasformare le RIGHE
 * salvate in eventi, e finche' quel qualcuno era un `JSON.parse` dentro un
 * `.map()`, una riga sola scritta a meta' faceva lanciare l'intera lettura —
 * cioe' esattamente il guasto che `researchRun.ts` dichiara di voler rendere
 * impossibile: «a run that cannot be replayed is a run whose paid-for work is
 * lost».
 *
 * Su questo telefono non e' un caso di scuola. Il processo viene ucciso mentre
 * scrive: Doze a schermo spento, il tetto di sei ore dei servizi `dataSync`,
 * ColorOS che chiude in background piu' aggressivamente della media.
 *
 * Ricerca, 12/09/2026 — la regola che il campo ha scelto per i giornali a righe
 * (JSONL) e' sempre la stessa, e non e' «salta la riga rotta e prosegui»:
 *
 *  - HKUDS/Vibe-Trading PR #147, «handle corrupted JSONL lines and harden
 *    message writes» — scrittura atomica (temporaneo + rename) sul lato che
 *    scrive, riparazione della coda strappata sul lato che legge, invece di
 *    perdere in silenzio il messaggio successivo.
 *    https://github.com/HKUDS/Vibe-Trading/pull/147
 *  - «JSONL: a practical guide to JSON Lines», flaviocopes.com — il formato
 *    definisce la riga e NIENTE altro: non lucchetti, non transazioni, non
 *    ripristino; un processo puo' fermarsi dopo averne scritta meta'.
 *    https://flaviocopes.com/jsonl/
 *  - Akka Persistence, `typed/persistence.md` — un attore con eventi salvati si
 *    ripristina rigiocando il giornale all'avvio: il ripristino e' la via
 *    normale, non un caso d'emergenza.
 *    https://github.com/akka/akka/blob/master/akka-docs/src/main/paradox/typed/persistence.md
 *
 * ⇒ Una riga non terminata e' una scrittura MAI CONFERMATA. Si legge il
 * prefisso committato e ci si ferma li'. Non si salta per riprendere dopo: gli
 * eventi dopo un buco si ripiegherebbero su uno stato che non e' mai esistito,
 * e un rendiconto dei soldi costruito su uno stato inventato e' peggio di uno
 * corto.
 */

/** Cio' che il magazzino restituisce per ogni riga. Solo il campo che serve. */
export interface TalosResearchJournalRow {
    readonly payload_json: string
}

export interface TalosResearchJournalRead {
    /** Gli eventi effettivamente committati, nell'ordine in cui sono stati scritti. */
    readonly events: readonly TalosResearchEvent[]
    /**
     * Quante righe ci sono SU DISCO, non quante se ne sono lette.
     *
     * ⛔ E' il numero da cui riparte il contatore `seq` di chi scrive, e per
     * questo conta le righe rotte. Ripartire dal numero di eventi LETTI
     * riassegnerebbe il posto occupato dalla riga strappata, e `UNIQUE (run_id,
     * seq)` rifiuterebbe la scrittura successiva: la corsa non potrebbe piu'
     * avanzare di un solo passo. Meglio un posto bruciato che un giornale
     * bloccato.
     */
    readonly length: number
    /** Quante righe sono state scartate perche' illeggibili. Zero nel caso normale. */
    readonly torn: number
}

/**
 * Quanto di questo giornale e' vero.
 *
 * Si ferma alla prima riga che non si rilegge e dichiara quante ne ha lasciate
 * indietro, invece di tacere: chi legge un rendiconto ha diritto di sapere che
 * e' stato troncato, e un numero e' l'unico modo di dirlo che non si perde.
 */
export function talosResearchReadJournal(
    rows: readonly TalosResearchJournalRow[],
): TalosResearchJournalRead {
    const events: TalosResearchEvent[] = []
    for (let index = 0; index < rows.length; index += 1) {
        let parsed: unknown
        try {
            parsed = JSON.parse(rows[index]!.payload_json)
        } catch {
            // La coda strappata: da qui in poi non si sa piu' niente di vero.
            return { events, length: rows.length, torn: rows.length - index }
        }
        // Un oggetto senza `kind` non e' un evento: `talosResearchApply` lo
        // ignorerebbe in silenzio, e un evento ignorato dentro una lista
        // altrimenti valida e' indistinguibile da uno applicato. Qui si vede.
        if (!parsed || typeof parsed !== 'object' || typeof (parsed as { kind?: unknown }).kind !== 'string') {
            return { events, length: rows.length, torn: rows.length - index }
        }
        events.push(parsed as TalosResearchEvent)
    }
    return { events, length: rows.length, torn: 0 }
}

/**
 * Il giornale, riletto e ripiegato: lo stato della corsa e da dove si riprende.
 *
 * Una funzione sola invece di due chiamate accoppiate in ogni punto d'uso,
 * perche' «leggi le righe» e «rigiocale» sono un gesto solo e separarli e' come
 * il lettore arriva a rigiocare eventi che la lettura aveva gia' scartato.
 */
export function talosResearchLoadJournal(
    rows: readonly TalosResearchJournalRow[],
): { readonly run: TalosResearchRun | null, readonly length: number, readonly torn: number } {
    const read = talosResearchReadJournal(rows)
    return { run: talosResearchReplay(read.events), length: read.length, torn: read.torn }
}
