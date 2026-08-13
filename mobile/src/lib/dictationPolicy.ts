/**
 * ⛔⛔ LA LINGUA DELLA DETTATURA NON SI CHIEDE PIÙ.
 *
 * Owner 2026-08-10, sul Pad: parlava italiano con la dettatura impostata su
 * inglese. Il motore ha ascoltato e non ha sentito nulla — e aveva ragione.
 * Il difetto non è di chi parla: è di un'app che pretende che una persona
 * dichiari in anticipo la lingua di ogni frase.
 *
 * Il modo `'auto'` è il DEFAULT. Sotto, il nativo accende
 * `EXTRA_ENABLE_LANGUAGE_DETECTION` e `EXTRA_ENABLE_LANGUAGE_SWITCH`, che
 * cambiano lingua **dentro** la frase. Chi vuole ancora inchiodarla può, ma
 * deve chiederlo.
 *
 * ⛔ E l'elenco NON è più scritto qui. Prima erano due voci — `en` e `it` — su
 * un telefono che ne sa fare decine: una gabbia travestita da impostazione.
 * Adesso le lingue le **dichiara il dispositivo** (`ACTION_GET_LANGUAGE_DETAILS`),
 * e questo file si limita a validare la forma di un tag BCP 47.
 */
export type TalosDictationLanguageMode = string

/** Il valore che significa «decidilo tu, ascoltando». */
export const TALOS_LINGUA_AUTOMATICA = 'auto'

/** Il valore storico: «usa la lingua di sistema, senza rilevamento». */
export const TALOS_LINGUA_DI_SISTEMA = 'system'

export type TalosDictationErrorCode =
    | 'permissionDenied'
    | 'unavailable'
    | 'recognitionFailed'
    | 'startFailed'
    | 'startTimeout'
    | 'noSpeech'
    | 'stoppedResponding'

/**
 * Un tag BCP 47 come lo scrive Android: `it`, `it-IT`, `cmn-Hans-CN`,
 * `es-419`. ⛔ Si valida la FORMA e non un elenco: un elenco chiuso è
 * esattamente la gabbia che stiamo togliendo.
 */
const TAG_BCP47 = /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Z]{2}|\d{3}))?$/

export function talosTagDiLinguaValido(value: unknown): value is string {
    return typeof value === 'string' && TAG_BCP47.test(value)
}

export function parseTalosDictationLanguageMode(value: unknown): TalosDictationLanguageMode {
    // ⛔⛔ I TRE VALORI DEL VECCHIO MONDO DIVENTANO «AUTOMATICO», e non è una
    // scelta buttata via: `system`, `it` ed `en` erano le UNICHE tre voci del
    // menù, quindi nessuno ha mai potuto sceglierli CONTRO l'automatico —
    // l'automatico non c'era. Lasciare `en` a chi ce l'ha è garantire che il
    // difetto del 2026-08-10 si ripresenti identico dopo l'aggiornamento.
    //
    // ⛔ E l'ordine conta: `it` è ANCHE un tag BCP 47 valido, quindi se il
    // controllo generico venisse prima se lo prenderebbe e questa riga non
    // servirebbe a niente. Il test l'ha trovato al primo giro.
    if (value === TALOS_LINGUA_DI_SISTEMA || value === 'it' || value === 'en') {
        return TALOS_LINGUA_AUTOMATICA
    }
    // Una scelta del mondo NUOVO ha sempre la regione: `it-IT`, non `it`.
    if (talosTagDiLinguaValido(value) && String(value).includes('-')) return value
    return TALOS_LINGUA_AUTOMATICA
}

/**
 * Il tag da mandare al motore, o `undefined` per «non inchiodare niente».
 *
 * ⛔ `auto` e `system` tornano **entrambi** `undefined`, e non è una svista:
 * senza `EXTRA_LANGUAGE` il riconoscitore parte sulla lingua di sistema, che è
 * la base giusta in tutti e due i casi. La differenza fra i due sta
 * nell'accendere o no il rilevamento — vedi `talosRilevamentoAcceso`.
 */
export function resolveTalosDictationLanguageTag(
    mode: TalosDictationLanguageMode,
): string | undefined {
    if (mode === TALOS_LINGUA_AUTOMATICA || mode === TALOS_LINGUA_DI_SISTEMA) return undefined
    return talosTagDiLinguaValido(mode) ? mode : undefined
}

/** Il rilevamento si accende solo in automatico: una scelta esplicita si rispetta. */
export function talosRilevamentoAcceso(mode: TalosDictationLanguageMode): boolean {
    return mode === TALOS_LINGUA_AUTOMATICA
}

/**
 * ⛔⛔ I DUE TEMPI DELL'ASCOLTO NON STANNO PIU' QUI, ed e' una decisione.
 *
 * Ci sono stati, per un'ora, l'11 agosto. Poi e' arrivato un TERZO posto che
 * apre il microfono — `TalosOrecchioAnticipato`, che parte in `onCreate`
 * dell'Activity per non perdere la prima parola — e quel posto **non puo'
 * leggere una costante TypeScript**, perche' nasce prima del JavaScript.
 *
 * Tenerli qui avrebbe voluto dire due copie dello stesso numero: che e'
 * esattamente la causa dei due difetti di quella giornata — prima il numero non
 * arrivava affatto al ponte, poi arrivava solo a una delle due schermate.
 *
 * ⇒ Adesso vivono dove vengono APPLICATI: `TalosDictationPlugin.kt`
 * (`TALOS_PAUSA_FINE_FRASE_MS`, `TALOS_ATTESA_INIZIO_MS`), e valgono per
 * chiunque apra il microfono senza chiedere altro. Le opzioni `silenceMillis` e
 * `minimumMillis` restano nel ponte: servono a chi volesse un ascolto DIVERSO —
 * che e' una scelta da dichiarare, non un valore da ripetere.
 */
