/**
 * ⭐⭐⭐ L'APERTURA A GRADI — non spedire 63 schemi a ogni messaggio.
 *
 * ## Il numero che la impone, misurato il 2026-08-13
 *
 * | | |
 * |---|---|
 * | attrezzi | **63** |
 * | superficie | **42.540 byte ≈ 11.500 token**, a **ogni** messaggio |
 *
 * La documentazione Anthropic dà due soglie per accendere la ricerca degli
 * attrezzi: **10 o più attrezzi**, oppure **definizioni sopra i 10k token**.
 * Noi sfondiamo **entrambe**. E dà il motivo che conta più del risparmio: *«la
 * capacità di Claude di scegliere l'attrezzo giusto degrada oltre i 30-50
 * attrezzi disponibili»*.
 *
 * ⇒ Non è un'ottimizzazione di costo: è la cura di un difetto **misurato sul
 * Pad lo stesso giorno**. A «annulla la sveglia delle 7 e 30» il modello ha
 * scelto l'attrezzo che le METTE — sveglia ancora armata, una seconda alle
 * 07:30, l'Orologio aperto in faccia alla persona. È esattamente il guasto che
 * la documentazione descrive, capitato a noi.
 *
 * ## Due meccanismi, una politica
 *
 * ⛔ Non si scrive un meccanismo nostro dove il provider ne offre uno migliore.
 *
 * - **Anthropic**: la ricerca è **lato server** e generalmente disponibile.
 *   Gli attrezzi si marcano `defer_loading: true` e si spediscono **tutti lo
 *   stesso**; l'API li tiene fuori dal prefisso del prompt e li espande in
 *   linea quando il modello li scopre. Costo: **zero giri in più** e — la parte
 *   che vale di più su un telefono — **la cache del prompt resta valida**.
 * - **Tutti gli altri** (OpenAI, Gemini, OpenRouter, motore locale): il
 *   catalogo compatto che abbiamo già, con `tool_details`. Misurato il
 *   2026-08-09: 38.386 → 5.087 byte, **−87%**.
 *
 * ## ⛔ Cosa NON si differisce
 *
 * La documentazione è netta su due punti, e sono due modi di sbagliare:
 *
 *  1. **almeno un attrezzo deve restare non differito** — se si differisce
 *     tutto l'API risponde 400;
 *  2. **i 3-5 più usati restano in vista**, così le richieste comuni non pagano
 *     un giro di ricerca.
 *
 * ⛔ E un attrezzo differito **non può portare `cache_control`** (400). Oggi non
 * ne mettiamo su nessuno — verificato — ma chi ne aggiungesse uno deve saperlo.
 */
import type { TalosToolDefinition } from '@/lib/tools/registry'

/**
 * ⛔⛔ I POCHI CHE RESTANO SEMPRE IN VISTA — e perché proprio questi.
 *
 * La documentazione dice «i 3-5 **più usati**». Il modo onesto di saperlo
 * sarebbe leggere lo storico delle chiamate di questa persona: oggi le righe di
 * audit si **scrivono** ma non esiste un modo di rileggerle, quindi la
 * frequenza vera non è misurabile. Finché non lo è, la scelta si dichiara e si
 * motiva invece di fingere una misura che non abbiamo.
 *
 * Il criterio: sono i quattro che servono a **rispondere**, non ad agire —
 * quelli che entrano in quasi ogni discorso, che non chiedono consenso e che
 * non fanno succedere niente nel mondo. Un assistente che deve cercarsi
 * l'orologio prima di dire che ore sono ha pagato un giro per niente.
 *
 * ⇒ Quando lo storico diventerà leggibile, questa lista si **misura** e questo
 * commento va sostituito da una tabella con dentro i numeri.
 */
export const TALOS_ATTREZZI_SEMPRE_IN_VISTA: readonly string[] = Object.freeze([
    'time_now',
    'memory_search',
    'library_search',
    'web_search',
])

/**
 * Quanti byte pesa oggi la superficie degli attrezzi.
 *
 * ⛔ Si misura la forma che si spedisce davvero, non una stima: `description` e
 * `input` insieme, che è ciò che finisce nel prefisso.
 */
export function talosPesoDegliAttrezzi(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
    schemaDi: (tool: TalosToolDefinition<never>) => unknown,
): number {
    return tools.reduce((somma, tool) => somma
        + tool.name.length
        + tool.description.length
        + JSON.stringify(schemaDi(tool) ?? {}).length, 0)
}

/**
 * ⛔ 3,7 byte per token, MISURATO su questi schemi il 2026-08-09 (38.386 byte =
 * 10.375 token). Non è la media dell'inglese: è la media di **questo** testo,
 * che è pieno di `_` e di nomi composti, e per la domanda «sfondo i 10k token?»
 * conta solo questa.
 */
const BYTE_PER_TOKEN = 3.7

/** Le due soglie della documentazione Anthropic, in una funzione sola. */
export function talosConvieneAprireAGradi(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
    byteTotali: number,
): boolean {
    return tools.length >= 10 || byteTotali / BYTE_PER_TOKEN > 10_000
}

/**
 * Vero se questo attrezzo va tenuto fuori dal prefisso.
 *
 * ⛔ Rende `false` per i pochi in vista **e** per qualunque nome sconosciuto:
 * la lista dei sempre-in-vista può nominare un attrezzo che oggi non è offerto
 * (i permessi cambiano), e in quel caso differire tutto il resto lascerebbe
 * zero attrezzi non differiti — cioè il 400 che la documentazione descrive.
 * La guardia contro quel caso sta in `talosAttrezziAnthropic`.
 */
export function talosVaDifferito(nome: string): boolean {
    return !TALOS_ATTREZZI_SEMPRE_IN_VISTA.includes(nome)
}
