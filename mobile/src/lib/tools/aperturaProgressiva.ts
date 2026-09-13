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
 * ⛔⛔ CARATTERI PER TOKEN — RIMISURATO il 2026-09-10, ed era sbagliato.
 *
 * Valeva **3,7** dal 2026-08-09. Rimisurato oggi sul testo esatto che
 * {@link talosPesoDegliAttrezzi} conta — i **69** attrezzi veri, `name` +
 * `description` + lo schema serializzato, presi da `toolset.offer` con tutto
 * acceso e tutti i permessi a `allow` — con i **tokenizer ufficiali** dei due
 * modelli, non a stima:
 *
 * | | caratteri | token | car./token |
 * |---|---|---|---|
 * | Gemma 3 (`@lenml/tokenizer-gemma3`) | 48.888 | 11.831 | **4,13** |
 * | Qwen 3 (`@lenml/tokenizer-qwen3`) | 48.888 | 11.503 | **4,25** |
 *
 * ⇒ Con 3,7 la stima era **13.213 token contro 11.831 veri: +11,7%**. Sbaglia
 * in sicurezza (la soglia dei 10k scatta prima del dovuto), ma è comunque un
 * numero che entra in una decisione, e un numero sbagliato non si tiene.
 *
 * Si tiene il valore **più basso** dei due tokenizer, arrotondato per difetto:
 * dà la stima di token più **alta**, cioè continua a sbagliare dalla parte
 * dell'apertura a gradi invece che contro.
 *
 * ## ⛔ Come si RIMISURA — perché un numero così invecchia
 *
 * Invecchia a ogni attrezzo aggiunto e a ogni modello nuovo. Si rifà così,
 * senza dispositivo, in due passi:
 *
 *  1. un vitest che costruisce il toolset vero (`tests/unit/tools/pesoDegliSchemi.test.ts`
 *     è il seme già pronto), chiama `talosPesoDegliAttrezzi` e scrive su un
 *     file la STESSA concatenazione che quella funzione conta;
 *  2. uno script Node che rilegge il file e conta con `@lenml/tokenizer-gemma3`
 *     e `@lenml/tokenizer-qwen3` (`t.encode(testo).length`, meno
 *     `t.encode('').length` che è l'overhead dei token speciali).
 *
 * ⛔ NON si contano i byte al posto dei token: in questo progetto quell'errore
 * è già costato un fattore **3,9×** ([[il-giro-vero-trova-quattro-difetti-che-le-fixture-non-vedono]]).
 *
 * ⛔ E ciò che questa misura NON dice: il tokenizer di **Claude** non è né
 * Gemma né Qwen, e questa costante decide solo sul ramo Anthropic. Il rapporto
 * vero per quel tokenizer resta non misurato qui. Oggi non cambia nulla —
 * `tools.length >= 10` è già vero con 69 attrezzi e decide da solo — ma chi un
 * giorno spedisse meno di dieci attrezzi pesanti deve saperlo.
 *
 * ⛔ Il nome dice «BYTE» ma la grandezza contata da `talosPesoDegliAttrezzi` è
 * `String.length`, cioè **unità UTF-16**. Per l'ASCII di questi schemi le due
 * cose coincidono, e il nome resta com'è perché è esportato; ma chi un giorno
 * ci mettesse una descrizione con accenti o emoji conterebbe meno di quanto
 * pesa sul filo. Il nome onesto sarebbe `TALOS_CARATTERI_PER_TOKEN`.
 */
export const TALOS_BYTE_PER_TOKEN = 4.1
const BYTE_PER_TOKEN = TALOS_BYTE_PER_TOKEN

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
