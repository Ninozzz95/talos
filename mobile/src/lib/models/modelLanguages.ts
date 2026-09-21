/**
 * «Questo modello parla la tua lingua?» — l'unica domanda che nessun altro
 * catalogo puo' farsi.
 *
 * ## Il caso che l'ha fatta nascere
 *
 * Owner, 2026-08-05: scarica `hyperclovax-seed-text-instruct-1.5b` — il modello
 * coreano di NAVER — e gli parla italiano. Ne esce italiano di **forma** ma non
 * di sostanza («il tiziano», «ti prossio», «technicala»), con **자연** che
 * scappa in mezzo a una frase.
 *
 * Il motore aveva funzionato perfettamente: caricato, generato, reso, dichiarato
 * quale modello rispondeva. Era il MODELLO a essere sbagliato per la lingua, e
 * **niente glielo aveva detto** — prima di scaricare due gigabyte.
 *
 * ## Il dato c'era gia', e non lo si usava
 *
 * MISURATO sull'API del Hub lo stesso giorno:
 *
 *     Llama-3.2-1B   →  language: ["en","de","fr","it","pt","hi","es","th"]
 *     HyperCLOVAX    →  nessuna dichiarazione
 *
 * TALOS chiedeva gia' `expand[]=tags` e teneva i tag; `cardData.language` non lo
 * leggeva nessuno.
 *
 * ## Perche' e' un vantaggio che gli altri non hanno
 *
 * Nessun catalogo web puo' avvisarti sulla **tua** lingua, perche' non sa quale
 * sia. TALOS la sa: e' la lingua della sua interfaccia. E' la stessa leva di
 * «Ci sta», che sa quanta memoria ha QUESTO telefono.
 *
 * ## Tre stati, non due
 *
 * Un booleano mentirebbe. «Non dichiara» **non e'** «non la parla»: e' l'assenza
 * di una dichiarazione. Stessa dottrina del filtro di peso e della capienza —
 * «non lo so» non e' «no».
 *
 * L'unico stato che merita un avviso e' quello di mezzo: **dichiara le sue
 * lingue, e la tua non c'e'**. Li' si sa qualcosa di utile, e tacere sarebbe
 * una scelta.
 */

export type TalosLanguageVerdict = 'yes' | 'no' | 'unknown'

/**
 * Etichette che compaiono fra le lingue ma non sono lingue.
 *
 * `multilingual` e' una promessa generica, non un elenco: prometterla come «si,
 * parla l'italiano» sarebbe inventare. Contarla come lingua dichiarata
 * trasformerebbe inoltre un «non si sa» onesto in un «no» falso.
 */
const NON_LINGUE = new Set(['multilingual', 'multi', 'code', 'any'])

/**
 * La radice di un codice lingua: `pt-BR` → `pt`, `zh-Hans` → `zh`.
 *
 * Trattare una variante regionale come lingua diversa manderebbe un avviso
 * sbagliato a mezzo Brasile.
 */
function radice(codice: string): string {
    return codice.trim().toLocaleLowerCase('en-US').split(/[-_]/)[0] ?? ''
}

/**
 * Se il modello dichiara di parlare `lingua`.
 *
 * @param dichiarate `cardData.language` della scheda, o nulla se assente.
 * @param lingua la lingua dell'interfaccia — cioe' quella in cui l'utente
 *     scrivera' davvero.
 */
export function talosModelSpeaks(
    dichiarate: readonly string[] | null | undefined,
    lingua: string,
): TalosLanguageVerdict {
    const elenco = (dichiarate ?? [])
        .map(radice)
        .filter((codice) => codice.length > 0 && !NON_LINGUE.has(codice))

    // Nessuna dichiarazione utilizzabile: si tace, non si accusa.
    if (elenco.length === 0) return 'unknown'
    return elenco.includes(radice(lingua)) ? 'yes' : 'no'
}
