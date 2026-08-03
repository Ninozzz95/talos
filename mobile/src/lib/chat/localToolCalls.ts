/**
 * Le chiamate di un modello locale, portate alla forma che tutti gli altri
 * usano.
 *
 * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key». La
 * conseguenza pratica è che l'esecutore a valle non deve avere un ramo per la
 * provenienza — e per non averlo, la normalizzazione va fatta una volta, qui.
 */

export interface TalosLocalToolCall {
    readonly name: string
    readonly arguments: string
    readonly id: string
}

/**
 * Un identificativo per chi non lo emette.
 *
 * Misurato sul tablet il 2026-08-03 con qwen2.5-3b: la chiamata torna corretta
 * — nome giusto, argomenti giusti — e con `id` **vuoto**, perché il formato
 * Hermes che Qwen usa non ne prevede uno. Non è un difetto del modello: è un
 * campo che esiste nel protocollo OpenAI e non in quello.
 *
 * Conta perché il risultato di un tool viene riappaiato alla richiesta
 * ATTRAVERSO quell'identificativo. Due chiamate nello stesso turno con id
 * vuoto sono due risultati che non si sa a chi appartengono, e il modello
 * riceverebbe la risposta sbagliata alla domanda sbagliata — un guasto che non
 * somiglia affatto a un guasto.
 *
 * L'indice basta e non serve altro: l'accoppiamento vive dentro un solo turno,
 * quindi non c'è niente da rendere unico oltre quel turno. Un numero casuale
 * qui renderebbe soltanto irriproducibile un test.
 */
export function talosNormaliseLocalToolCalls(
    calls: ReadonlyArray<{ name: string, arguments: string, id?: string }> | undefined,
): readonly TalosLocalToolCall[] {
    if (!calls?.length) return []
    return calls.map((call, index) => ({
        name: call.name,
        arguments: call.arguments,
        id: call.id && call.id.length > 0 ? call.id : `local_${index}`,
    }))
}
