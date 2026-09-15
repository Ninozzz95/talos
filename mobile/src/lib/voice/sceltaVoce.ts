/**
 * ⭐⭐ QUALE VOCE, fra le 473 che il telefono ha davvero.
 *
 * Owner 2026-08-10: «la voce è troppo robotica… voglio il meglio del meglio».
 *
 * ## ⛔ Il difetto era che sceglievamo NIENTE
 *
 * MISURATO sul Pad, chiedendo i due elenchi nello stesso istante:
 *
 * ```
 *   Web Speech API (quello che la schermata mostrava)     0 voci
 *   plugin nativo  (quello che parla davvero)           473 voci
 *   voce in uso                                    it-IT-language
 * ```
 *
 * Cioè: il selettore era **vuoto** — non offriva nessuna scelta — e il motore
 * restava sulla voce generica del sistema, che è quella predefinita e la più
 * piatta. Non c'era una scelta sbagliata: non c'era nessuna scelta.
 *
 * ## ⛔ E la «qualità» dichiarata non serve a distinguerle
 *
 * Tutte e nove le voci italiane del Pad dichiarano `quality: 400` e
 * `latency: 200`. Ordinare per qualità le lascia esattamente com'erano. Quello
 * che le distingue davvero, misurato sui nomi che Android restituisce:
 *
 * ```
 *   it-IT-language          la GENERICA: il ripiego del motore
 *   it-it-x-itb-local       una voce NOMINATA, sul telefono
 *   it-it-x-itb-network     la stessa, sintetizzata dai server: la neurale
 * ```
 *
 * ⇒ Due criteri, in quest'ordine: **nominata prima della generica**, e
 * **network prima di local** quando si accetta la rete. Il resto (qualità,
 * latenza) rompe solo i pareggi.
 */

export interface TalosVoceDispositivo {
    /** L'id da passare al motore. */
    name: string
    /** Tag BCP-47, es. `it-IT`. */
    locale: string
    /** 100/300/400/500 secondo Android — più alto è meglio. */
    quality: number
    /** Quanto ci mette a partire; più basso è meglio. */
    latency: number
    /** Se ha bisogno della rete: più bella, ma non funziona offline. */
    network: boolean
    /** Se va scaricata prima di poterla usare. */
    notInstalled: boolean
}

/** La lingua di un tag, senza la regione: `it-IT` → `it`. */
export function talosLinguaDi(tag: string): string {
    return (tag || '').split(/[-_]/)[0]!.toLowerCase()
}

/**
 * ⛔ La GENERICA si riconosce dal suffisso, non da un elenco scritto a mano.
 *
 * Android chiama la voce di ripiego di una lingua `<tag>-language` — è la
 * stessa forma su ogni motore e su ogni lingua. Cercarla per nome («it-IT-language»)
 * avrebbe funzionato solo in italiano, e su questo telefono.
 */
export function talosVoceGenerica(voce: TalosVoceDispositivo): boolean {
    return /-language$/i.test(voce.name)
}

/** Le voci nominate hanno la forma `xx-yy-x-abc-local|network`. */
export function talosVoceNominata(voce: TalosVoceDispositivo): boolean {
    return /-x-[a-z0-9]+-(local|network)$/i.test(voce.name)
}

/**
 * Il nome breve che una persona può distinguere, ricavato dal nome vero.
 *
 * `it-it-x-itb-network` → `itb`. Non è un nome bello, ed è voluto: inventare
 * «Aurora» o «Marco» significherebbe promettere un genere e un carattere che
 * Android **non dichiara** — `Voice` non espone il sesso della voce. Chi
 * sceglie deve ascoltare, e per questo accanto a ognuna c'è la prova.
 */
export function talosSiglaVoce(voce: TalosVoceDispositivo): string {
    return voce.name.match(/-x-([a-z0-9]+)-(?:local|network)$/i)?.[1]?.toLowerCase()
        ?? voce.name
}

export interface TalosPreferenzaVoce {
    /** La lingua che si vuole sentire, es. `it` o `it-IT`. */
    lingua: string
    /** Se si accetta una voce che passa dalla rete. Offline: `false`. */
    rete: boolean
}

/**
 * Ordina le voci di una lingua dalla migliore alla peggiore.
 *
 * ⛔ Le voci non installate NON compaiono: offrirle vorrebbe dire far scegliere
 * qualcosa che poi non parla. Vanno scaricate prima, ed è un'altra cosa.
 */
export function talosVociOrdinate(
    voci: readonly TalosVoceDispositivo[],
    preferenza: TalosPreferenzaVoce,
): TalosVoceDispositivo[] {
    const lingua = talosLinguaDi(preferenza.lingua)
    return voci
        .filter((v) => !v.notInstalled)
        .filter((v) => talosLinguaDi(v.locale) === lingua)
        .filter((v) => preferenza.rete || !v.network)
        .slice()
        .sort((a, b) => {
            // 1. una voce nominata batte sempre la generica
            const na = talosVoceGenerica(a) ? 1 : 0
            const nb = talosVoceGenerica(b) ? 1 : 0
            if (na !== nb) return na - nb
            // 2. con la rete accettata, la neurale batte quella sul telefono
            if (preferenza.rete && a.network !== b.network) return a.network ? -1 : 1
            // 3. poi la qualità dichiarata, poi la prontezza
            if (a.quality !== b.quality) return b.quality - a.quality
            if (a.latency !== b.latency) return a.latency - b.latency
            return a.name.localeCompare(b.name)
        })
}

/**
 * La voce da usare: quella scelta dalla persona se c'è ancora, altrimenti la
 * migliore.
 *
 * ⛔ «se c'è ancora» non è pignoleria: le voci spariscono quando il motore si
 * aggiorna o la lingua viene disinstallata, e una preferenza che punta al
 * vuoto lascia il motore sulla generica **senza dirlo**. Meglio scivolare sulla
 * migliore disponibile e poterlo raccontare.
 */
export function talosVoceDaUsare(
    voci: readonly TalosVoceDispositivo[],
    preferenza: TalosPreferenzaVoce & { scelta?: string | null },
): { voce: TalosVoceDispositivo | null, motivo: 'scelta' | 'migliore' | 'nessuna' } {
    const ordinate = talosVociOrdinate(voci, preferenza)
    if (preferenza.scelta) {
        const trovata = ordinate.find((v) => v.name === preferenza.scelta)
        if (trovata) return { voce: trovata, motivo: 'scelta' }
    }
    return ordinate.length
        ? { voce: ordinate[0]!, motivo: 'migliore' }
        : { voce: null, motivo: 'nessuna' }
}

/**
 * ⭐⭐ LE VOCI CHE SI OFFRONO DAVVERO — due, e scelte a orecchio.
 *
 * ## Da dove viene questa regola
 *
 * Owner 2026-08-10, dopo averle ascoltate tutte: «vorrei solo le prime tre
 * disponibili, le altre non mi piacciono, sono troppo robotiche». Poi, il
 * 2026-08-11: «togli la voce predefinita e mantieni solo la prima e l'ultima
 * voce (rete)».
 *
 * ⇒ Delle tre che l'ordinamento porta in testa restano **la prima e l'ultima**:
 * la mediana non piaceva. Non è un criterio tecnico e non finge di esserlo —
 * Android dichiara `quality: 400` per tutte e nove le voci italiane del Pad,
 * quindi nessun numero avrebbe potuto separarle. Le ha separate un orecchio.
 *
 * MISURATO sul Pad l'11 agosto, le tre in testa sono `itb · rete`, `itc · rete`,
 * `itd · rete` — tutte neurali, il che spiega il «(rete)» dell'owner. Restano
 * la prima e la terza.
 *
 * ## ⛔ E perché la MEDIANA e non «le prime due»
 *
 * Perché è quello che è stato chiesto, e la differenza si sente: `itc` è la voce
 * che l'owner ha scartato, non la terza in graduatoria. Prendere «le prime due»
 * sarebbe stato più semplice da scrivere e avrebbe tenuto proprio quella.
 *
 * ⛔ Con meno di tre voci disponibili non si inventa niente: si restituisce
 * quello che c'è. Un dispositivo con una voce sola deve poterla scegliere.
 */
export function talosVociOfferte(
    voci: readonly TalosVoceDispositivo[],
    preferenza: TalosPreferenzaVoce,
): TalosVoceDispositivo[] {
    const ordinate = talosVociOrdinate(voci, preferenza)
    const candidate = ordinate.slice(0, 3)
    if (candidate.length <= 2) return candidate
    return [candidate[0], candidate[candidate.length - 1]]
}
