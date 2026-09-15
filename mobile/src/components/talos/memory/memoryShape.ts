import { CircleAlert, Folder, Layers, Shield, SlidersHorizontal } from '@lucide/vue'

/**
 * Che COS'È una memoria, letto dalla riga vera del deposito.
 *
 * ⛔ Sta fuori dai componenti di proposito, come `noteShape.ts` per le Note. Le
 * stesse tre domande — «di che tipo è?», «in che stato è?», «che anteprima ne
 * esce?» — servono alla scheda, alla riga e alla pagina aperta: tenute dentro
 * una di quelle, le altre due avrebbero copiato la tabella, ed è così che due
 * superfici della stessa app iniziano a dare due risposte diverse sulla stessa
 * memoria.
 *
 * ## ⛔ Perché il tipo si CHIEDE, mentre quello di una nota si deduce
 *
 * Perché una memoria non è una nota: il modello la rilegge da sola in ogni
 * conversazione futura, e il tipo decide come la userà. È la decisione già
 * scritta in `MemoryNewScreen.vue` il 2026-08-06, e il mockup «Talos Calm
 * Finale» dice la stessa cosa — `MEMORY_KINDS` (`src/app.js:82`) è una tabella
 * di quattro voci, non un riconoscitore.
 *
 * ## ⛔ IL MODELLO DATI HA UN QUINTO VALORE CHE IL MOCKUP NON CONOSCE
 *
 * `TalosMemoryKind` (`chatRepository.ts:230`) ammette anche `'rejected'`, e
 * `TalosMemoryStatus` ammette `'quarantined'` e `'rejected'` oltre ad `active`
 * e `disabled`. Sono le memorie che il MODELLO ha proposto e che nessuno ha
 * approvato: esistono nel deposito, e un elenco che le tace mostrerebbe meno
 * righe di quante ce ne sono senza dire perché.
 *
 * Owner 12/09/2026 (U-18): stanno tutte sotto una parola sola — **«Da
 * rivedere»** — che è un filtro nella striscia e un'etichetta sulla scheda. Il
 * mockup non ce l'ha perché il mockup non ha un modello che propone.
 */

/** I quattro tipi che una persona può scegliere. L'ordine è quello del mockup. */
export const TALOS_MEMORY_KINDS = Object.freeze([
    'preference',
    'project_fact',
    'procedure',
    'policy_note',
] as const)

export type TalosMemoryKindId = (typeof TALOS_MEMORY_KINDS)[number]

/**
 * Il tipo di una riga, o `null` se non è uno dei quattro.
 *
 * ⛔ Torna `null` invece di cadere su «Preferenza»: un ripiego silenzioso
 * scriverebbe «Preferenza» sopra una proposta rifiutata dal modello, cioè
 * direbbe una cosa falsa con l'aria di saperla. Chi chiama decide cosa mostrare
 * quando non lo sappiamo — e qui si mostra «Da rivedere».
 */
export function talosMemoryKindOf(kind: string | null | undefined): TalosMemoryKindId | null {
    return (TALOS_MEMORY_KINDS as readonly string[]).includes(String(kind ?? ''))
        ? (kind as TalosMemoryKindId)
        : null
}

/**
 * L'icona del tipo. Sono quelle del mockup, tradotte nel nostro set:
 * `settings` → cursori, `folder` → cartella, `layers` → strati, `shield` →
 * scudo (`MEMORY_KINDS`, `src/app.js:82`).
 */
export function talosMemoryKindIcon(kind: string | null | undefined): unknown {
    switch (talosMemoryKindOf(kind)) {
        case 'preference': return SlidersHorizontal
        case 'project_fact': return Folder
        case 'procedure': return Layers
        case 'policy_note': return Shield
        // Una proposta che nessuno ha approvato non è un tipo: è una domanda
        // aperta, e il punto esclamativo è l'unica cosa onesta da disegnarci.
        default: return CircleAlert
    }
}

/** La chiave del nome del tipo, come si legge a schermo. */
export function talosMemoryKindLabelKey(kind: string | null | undefined): string {
    switch (talosMemoryKindOf(kind)) {
        case 'preference': return 'memory.preference'
        case 'project_fact': return 'memory.projectFact'
        case 'procedure': return 'memory.procedure'
        case 'policy_note': return 'memory.policyNote'
        default: return 'memory.kindReview'
    }
}

/**
 * La frase che dice a cosa serve questo tipo — il piede della pagina aperta.
 *
 * Sono gli `hint` del mockup: «Come preferisci lavorare», «Un riferimento da
 * ricordare», «Un modo di procedere», «Un criterio da tenere presente».
 */
export function talosMemoryKindHintKey(kind: string | null | undefined): string {
    switch (talosMemoryKindOf(kind)) {
        case 'preference': return 'memory.hintPreference'
        case 'project_fact': return 'memory.hintProjectFact'
        case 'procedure': return 'memory.hintProcedure'
        case 'policy_note': return 'memory.hintPolicyNote'
        default: return 'memory.hintReview'
    }
}

/**
 * In che stato è una memoria, in una parola sola.
 *
 * Tre, non due, e non è una scelta estetica: `active` la porta nelle prossime
 * conversazioni, `disabled` è una decisione di chi la possiede, e
 * `quarantined`/`rejected` sono righe che **nessuno ha ancora guardato**. Un
 * badge a due stati dovrebbe chiamare «in pausa» anche la terza, cioè
 * attribuire all'utente una decisione che non ha preso.
 */
export type TalosMemoryState = 'active' | 'paused' | 'review'

export function talosMemoryStateOf(
    memory: { status?: string | null; kind?: string | null },
): TalosMemoryState {
    // Il KIND conta quanto lo stato: una proposta rifiutata resta da rivedere
    // anche se la sua riga è rimasta `active`. Guardare un campo solo lascerebbe
    // fuori metà dei casi che questa funzione esiste per riconoscere.
    if (memory.kind === 'rejected') return 'review'
    if (memory.status === 'quarantined' || memory.status === 'rejected') return 'review'
    if (memory.status === 'disabled') return 'paused'
    return 'active'
}

/** La chiave dell'etichetta di stato, come si legge sul badge. */
export function talosMemoryStateLabelKey(state: TalosMemoryState): string {
    if (state === 'active') return 'memory.stateActive'
    if (state === 'paused') return 'memory.statePaused'
    return 'memory.stateReview'
}

/**
 * Dove vale una memoria — «Globale», «Progetto · id», «Questa chat».
 *
 * ⛔ Il mockup scrive sempre «Globale» perché la sua demo non ha altri ambiti.
 * Il nostro modello ne ha tre (`scope_type`), e copiare la stringa fissa
 * vorrebbe dire mentire su due terzi delle righe possibili.
 *
 * Torna la chiave e i suoi parametri invece della frase già tradotta: così la
 * scheda, la riga e la pagina aperta rispondono dalla stessa tabella, senza che
 * questo file abbia bisogno di conoscere il traduttore.
 */
export function talosMemoryScope(
    memory: { scope_type?: string | null; scope_id?: string | null },
): { readonly key: string; readonly params?: Record<string, string> } {
    if (memory.scope_type === 'session') return { key: 'memory.chatScope' }
    if (memory.scope_type === 'project') {
        return memory.scope_id
            ? { key: 'memory.projectScoped', params: { id: memory.scope_id } }
            : { key: 'memory.project' }
    }
    return { key: 'memory.global' }
}

/**
 * L'anteprima: la riga ANTICIPA, la pagina CONTIENE.
 *
 * Gli a capo restano (il mockup tiene `white-space: pre-line` sulla frase della
 * scheda, `section-personalities.css:78`) perché una procedura scritta a punti
 * numerati si riconosce dalla forma prima che dalle parole. Quello che si
 * schiaccia sono gli spazi dentro una riga, non le righe fra loro.
 */
export function talosMemoryPreview(content: string | null | undefined, limit = 190): string {
    const text = String(content ?? '')
        .split('\n')
        .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    if (text.length <= limit) return text
    const head = text.slice(0, limit - 1)
    const space = head.lastIndexOf(' ')
    return `${head.slice(0, space > limit * 0.7 ? space : head.length).trimEnd()}…`
}

/**
 * La data di una memoria, corta nell'elenco e per esteso nella pagina.
 *
 * Stessa forma della nota (`talosNoteDate`), e per la stessa ragione: la
 * domanda è «quando l'ho scritta?», non «quanto è recente?». Duplicata invece
 * che importata da `notes/` perché una stazione non deve dipendere dalla forma
 * di un'altra per sapere che giorno è — e sono nove righe.
 */
export function talosMemoryDate(
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
