/**
 * The permission vocabulary, deliberately free of any dependency.
 *
 * Settings needs these three words at boot; the executor that enforces them
 * pulls in zod (for schema validation) and belongs in the lazy graph. Keeping
 * them apart is worth ~27 KB of initial JavaScript — measured, not assumed.
 */
/**
 * ⭐⭐⭐ `execute` è la quarta, ed è arrivata con l'esecuzione di codice vero.
 *
 * `npm test` **esegue codice arbitrario**, e non è né una lettura né una
 * scrittura né una chiamata verso l'esterno: con tre parole sole non avevamo
 * modo di dirlo. Un potere che il vocabolario non sa nominare è un potere che
 * la persona non può governare.
 *
 * ⛔ La grammatica delle RISPOSTE non cambia e non cambierà: `allow / ask /
 * deny`, sempre. Cambia il numero dei poteri, non la loro forma — è la regola
 * G3, e regge.
 */
export type TalosToolAction = 'read' | 'write' | 'outbound' | 'execute'

export type TalosToolPermission = 'allow' | 'ask' | 'deny'

export type TalosToolPermissions = Record<TalosToolAction, TalosToolPermission>

/**
 * Owner 2026-08-01: **everything asks.**
 *
 * Replaces the 2026-07-25 split (read free, write asks, outbound refused). That
 * arrangement was decided before there was anything to ask WITH: the
 * authorization card — Deny / Allow this time / Always allow — now exists, and a
 * refusal that never asks is only the right default when there is no way to put
 * the question. `deny` also turned out to be the wrong shape for a default at
 * all: it is indistinguishable from a considered "never", so nothing downstream
 * could tell an opinion from an absence.
 *
 * `ask` cannot leak anything — that is what makes it safe as a floor. And it is
 * asked once per tool: "Always allow" writes a revocable grant, so the cost is
 * one question, not one per message.
 */
export const TALOS_DEFAULT_TOOL_PERMISSIONS: TalosToolPermissions = {
    read: 'ask',
    write: 'ask',
    outbound: 'ask',
    /**
     * ⛔⛔ `ask`, e come DEFAULT — mai come scelta della persona.
     *
     * Chi ha installato l'app prima che questa parola esistesse non ha
     * `execute` fra i valori salvati: `talosEffectiveToolPermissions` lo porta
     * al default di oggi, e `tools_chosen` resta senza. ⇒ Nessuno si ritrova
     * ad aver «deciso» qualcosa su cui non gli è mai stata posta la domanda.
     */
    execute: 'ask',
}

/** Anything unrecognised resolves to the SAFEST setting for that class. */
export function decideTalosToolPermission(
    action: TalosToolAction,
    permissions: Partial<TalosToolPermissions> | undefined,
): TalosToolPermission {
    const value = permissions?.[action]
    if (value === 'allow' || value === 'ask' || value === 'deny') return value
    return TALOS_DEFAULT_TOOL_PERMISSIONS[action]
}

/**
 * Il vocabolario COMPLETO, e serve all'applicazione dei permessi.
 *
 * ⛔ Non è la lista che si mostra alla persona: quella si deriva dagli attrezzi
 * che esistono davvero — vedi `talosAzioniGovernate`. Tenere qui la lista
 * completa è ciò che permette a un valore mai scelto di essere normalizzato al
 * default di oggi anche prima che un attrezzo lo usi.
 */
export const TALOS_TOOL_ACTIONS: readonly TalosToolAction[] = ['read', 'write', 'outbound', 'execute']

/**
 * ⭐⭐ LE AZIONI CHE SI GOVERNANO: quelle che almeno un attrezzo dichiara.
 *
 * ## ⛔ Perché non basta `TALOS_TOOL_ACTIONS`
 *
 * Il giorno in cui `execute` è entrata nel vocabolario, nessun attrezzo la
 * dichiarava ancora. Mostrarla lo stesso avrebbe prodotto due difetti visibili
 * — misurati, non temuti:
 *
 *   1. una quarta riga nella scheda dei permessi **senza icona e senza
 *      traduzione**, per un potere che nessuno può esercitare;
 *   2. `autonomiaGiaConcessa` — «ogni azione è `allow` e scelta» — sarebbe
 *      diventata **falsa per chiunque l'avesse già concessa**, e lo schermo
 *      avrebbe richiesto un permesso che la persona aveva già dato.
 *
 * ⇒ La scheda mostra i poteri che **esistono**, non quelli che il tipo sa
 * scrivere. E il giorno che il primo attrezzo dichiara `execute`, la riga
 * compare da sola — con la sua icona, la sua stringa e la sua domanda.
 *
 * ⛔ Nessuna dipendenza: le azioni dichiarate arrivano da fuori. Questo file
 * resta nel grafo d'avvio e vale ~27 KB di JavaScript iniziale.
 */
export function talosAzioniGovernate(
    dichiarate: Iterable<TalosToolAction>,
): readonly TalosToolAction[] {
    const viste = new Set<TalosToolAction>(dichiarate)
    return TALOS_TOOL_ACTIONS.filter((azione) => viste.has(azione))
}

/**
 * Which actions the user has actually DECIDED, as opposed to inherited.
 *
 * The difference is the whole point of what follows. A default is a guess made
 * on the user's behalf before they had an opinion; a choice is an opinion. Only
 * one of the two may be revised by the app.
 */
export function parseTalosChosenToolActions(value: unknown): readonly TalosToolAction[] {
    if (!Array.isArray(value)) return []
    const chosen: TalosToolAction[] = []
    for (const entry of value) {
        if (!TALOS_TOOL_ACTIONS.includes(entry as TalosToolAction)) continue
        if (!chosen.includes(entry)) chosen.push(entry)
    }
    return chosen
}

/**
 * The permissions that actually apply.
 *
 * One rule: **a value nobody chose is the default of TODAY, not the default of
 * the day the app was installed.**
 *
 * It sounds like a technicality and it is the whole defect. Settings persists
 * all three permissions whether or not the user ever opened the screen, so a
 * default becomes a stored value the first time anything is saved — and from
 * then on it is frozen. When the default changed on 2026-08-01, every existing
 * device would have gone on enforcing the old one forever, and the change would
 * have applied only to people who installed the app afterwards. A default that
 * cannot be revised is not a default; it is a decision taken on the user's
 * behalf and then hidden from them.
 *
 * What it deliberately does NOT do is revise a value the user CHOSE. Someone
 * who set "never allow" on purpose means it, and an app that quietly promotes
 * that has taken the word "never" away from them. That is what `chosen` is for,
 * and it is why touching a permission records the fact.
 */
export function talosEffectiveToolPermissions(input: {
    readonly stored: TalosToolPermissions
    readonly chosen: readonly TalosToolAction[]
}): TalosToolPermissions {
    let changed = false
    const effective = { ...input.stored }
    for (const action of TALOS_TOOL_ACTIONS) {
        if (input.chosen.includes(action)) continue
        if (effective[action] === TALOS_DEFAULT_TOOL_PERMISSIONS[action]) continue
        effective[action] = TALOS_DEFAULT_TOOL_PERMISSIONS[action]
        changed = true
    }
    return changed ? effective : input.stored
}
