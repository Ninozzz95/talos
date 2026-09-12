/**
 * Che FORMA ha una nota, letta dal testo che la persona ha scritto.
 *
 * ## Perché il tipo si deduce e non si chiede
 *
 * Il modulo di scrittura ha due campi, titolo e contenuto, e resta così: un
 * terzo controllo «che tipo di nota è questa?» costringerebbe a classificare
 * prima di aver scritto, cioè nel momento in cui ancora non si sa. Il mockup
 * «Talos Calm» decide dallo stesso posto da cui decide una persona che rilegge
 * — da come il testo è fatto — e questo file è quella lettura, portata sul
 * modello dati vero dell'app.
 *
 * ⛔ Sta fuori dai componenti di proposito. Le stesse tre domande («è una
 * checklist?», «che anteprima ne esce?», «di che tipo è?») servono alla scheda,
 * alla riga e alla pagina di dettaglio: tenute dentro una di quelle, le altre
 * due avrebbero copiato la regex — ed è così che due superfici della stessa app
 * iniziano a dare due risposte diverse sulla stessa nota.
 *
 * La grammatica riconosciuta è quella del mockup, non un Markdown completo:
 * `- [ ]` / `- [x]` per le spunte, `>` per una citazione, `#`/`##`/`###` per un
 * titolo interno, `-`/`*` per un elenco. Tutto il resto è un paragrafo. Un
 * parser Markdown vero qui sarebbe un motore di rendering per contenuto NON
 * ATTENDIBILE — link, immagini, HTML — e non è quello che serve a un appunto.
 */

/** Una riga spuntabile, con l'indice della riga originale per poterla riscrivere. */
export interface TalosNoteCheckItem {
    /** Indice della RIGA nel contenuto, non della spunta: serve per riscriverla. */
    readonly index: number
    readonly done: boolean
    readonly text: string
}

/**
 * Come la nota si presenta in una parola.
 *
 * `thought` è la citazione del mockup («Pensiero»): una nota che comincia con
 * `>` è qualcosa che si è voluto ricordare per come suonava, non un elenco di
 * cose da fare.
 */
export type TalosNoteKind = 'checklist' | 'thought' | 'note'

export type TalosNoteBlock =
    | { readonly kind: 'heading'; readonly text: string }
    | { readonly kind: 'quote'; readonly text: string }
    | { readonly kind: 'bullet'; readonly text: string }
    | { readonly kind: 'paragraph'; readonly text: string }
    /** Una riga vuota: nella prosa è uno stacco, non un paragrafo vuoto. */
    | { readonly kind: 'gap' }

const CHECK_LINE = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/
const HEADING_LINE = /^#{1,3}\s/
const QUOTE_LINE = /^>\s?/
const BULLET_LINE = /^\s*[-*]\s/

/** Le righe spuntabili della nota, nell'ordine in cui stanno nel testo. */
export function talosNoteChecklist(content: string | null | undefined): TalosNoteCheckItem[] {
    return String(content ?? '').split('\n').flatMap((line, index) => {
        const match = CHECK_LINE.exec(line)
        // `!== ' '` e non `=== 'x'`: la X maiuscola è spunta quanto la minuscola,
        // e chi scrive a mano usa quella che gli capita.
        return match ? [{ index, done: match[1] !== ' ', text: match[2]! }] : []
    })
}

/**
 * Di che tipo è questa nota.
 *
 * L'ordine delle domande conta: una checklist che comincia con una citazione
 * resta una checklist, perché le spunte sono la cosa che si va a fare e la
 * citazione è il suo cappello.
 */
export function talosNoteKind(content: string | null | undefined): TalosNoteKind {
    if (talosNoteChecklist(content).length > 0) return 'checklist'
    // `^>` su una riga QUALSIASI, come il mockup: la citazione può stare dopo
    // una riga di contesto, e resta la cosa che dà il tono alla nota.
    return /^>/m.test(String(content ?? '')) ? 'thought' : 'note'
}

/**
 * La nota come blocchi di prosa.
 *
 * `limit` taglia in ANTEPRIMA (la scheda mostra l'inizio, non tutto): la pagina
 * di dettaglio lo lascia stare e riceve la nota intera. Il taglio è sulle
 * RIGHE e non sui caratteri, perché mezza citazione a metà parola è peggio di
 * una citazione in meno.
 */
export function talosNoteBlocks(
    content: string | null | undefined,
    limit?: number,
): TalosNoteBlock[] {
    const lines = String(content ?? '').split('\n')
    const kept = typeof limit === 'number' ? lines.slice(0, limit) : lines
    return kept.map((line): TalosNoteBlock => {
        if (HEADING_LINE.test(line)) return { kind: 'heading', text: line.replace(/^#{1,3}\s+/, '') }
        if (QUOTE_LINE.test(line)) return { kind: 'quote', text: line.replace(QUOTE_LINE, '') }
        if (BULLET_LINE.test(line)) return { kind: 'bullet', text: line.replace(/^\s*[-*]\s+/, '') }
        return line.trim() ? { kind: 'paragraph', text: line } : { kind: 'gap' }
    })
}

/**
 * Il testo di una nota schiacciato su una riga, per l'elenco in Lista.
 *
 * Tiene i segni (`>`, `- [x]`, `##`) invece di toglierli, come il mockup: in
 * una riga sola servono a capire in un colpo d'occhio che quella nota è una
 * citazione o un elenco, e toglierli renderebbe tre note diverse tre paragrafi
 * uguali.
 *
 * Taglia su uno SPAZIO quando lo spazio è abbastanza avanti, altrimenti sul
 * carattere: spezzare a metà parola è brutto, ma una parola lunghissima senza
 * spazi non deve far sparire l'anteprima.
 */
export function talosNotePlainPreview(content: string | null | undefined, limit = 190): string {
    const text = String(content ?? '').replace(/\s+/g, ' ').trim()
    if (text.length <= limit) return text
    const head = text.slice(0, limit - 1)
    const space = head.lastIndexOf(' ')
    return `${head.slice(0, space > limit * 0.7 ? space : head.length).trimEnd()}…`
}

/**
 * La data di una nota, corta per l'elenco e per esteso nella pagina.
 *
 * ## Perché una data e non «2 giorni fa»
 *
 * Perché la domanda che si fa a un appunto non è «quanto è recente?» ma
 * «quando l'ho scritto?»: un'idea si ritrova ripensando al giorno in cui è
 * venuta, non al numero di ore passate. È anche la scelta del mockup, ed è
 * l'unico punto in cui questa schermata si stacca dal tempo relativo usato
 * dalla chat — dove invece «2 minuti fa» è esattamente la domanda giusta.
 *
 * ⛔ Torna una stringa vuota su una data che non si legge, non «Invalid Date»:
 * una riga senza data è meglio di una riga che dichiara un guasto.
 */
export function talosNoteDate(
    value: string | null | undefined,
    locale: string,
    long = false,
): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: long ? 'long' : 'short',
        ...(long ? { year: 'numeric' } : {}),
    }).format(date)
}

/**
 * La nota come testo, per l'esportazione.
 *
 * Titolo, riga vuota, contenuto — la forma minima che resta leggibile in
 * qualunque cosa la riceva (un messaggio, una mail, un editor). Niente
 * intestazioni nostre e niente firma: quello che esce è quello che la persona
 * ha scritto, e aggiungerci sopra il nome dell'app significherebbe mandare a un
 * altro programma una riga che la persona non ha mai scritto.
 */
export function talosNoteAsPlainText(note: { title: string; content: string }): string {
    const title = note.title.trim()
    const content = note.content.trim()
    if (!content) return title
    return `${title}\n\n${content}`
}
