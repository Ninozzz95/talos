import { talosTracciaFuori } from '@/lib/device/traccia'
import type { TalosPrefixOutcome } from '@/lib/models/prefixCache'

/**
 * B1 — un ID che lega tutti gli eventi di UNA generazione locale, dal
 * momento in cui l'adattatore la prende in carico fino a quando finisce.
 *
 * ⛔ Perché esiste: prima di questo file, zero occorrenze di un id di
 * correlazione in tutto `mobile/` (grep esaustivo, sessione 22/8). Un
 * TTFT/PP/TG futuro non si poteva mai ricondurre a UNA generazione precisa
 * - solo a "una qualche generazione, più o meno in quel momento".
 *
 * ⛔ Non crittograficamente forte, e non deve esserlo: serve solo a
 * distinguere due generazioni vicine in un unico log locale, non a
 * proteggere niente. `Date.now()` da solo basterebbe quasi sempre; il
 * suffisso casuale copre il caso raro di due generazioni nello stesso
 * millisecondo.
 */
export function talosNewLocalTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Un evento della generazione `traceId`, verso lo stesso canale che porta
 * fuori dalla WebView la dettatura e il pilota dello schermo -
 * `talosTracciaFuori` (vedi `lib/device/traccia.ts`: un `console.info` da
 * qui NON arriva in logcat, misurato l'11/8).
 *
 * Forma della riga: `local:<traceId> <evento>` - un `grep local:<id>` su
 * logcat mostra la generazione intera, in ordine, con l'ora presa al
 * FATTO e non alla consegna (la stessa disciplina di `talosTracciaFuori`).
 */
export function talosLocalTrace(traceId: string, event: string): void {
    talosTracciaFuori(`local:${traceId} ${event}`)
}

/**
 * ⭐⭐⭐ FASE 2 — le misure di UNA generazione locale, quelle che finiscono
 * SOTTO la risposta.
 *
 * ⛔ Perché qui e non in un file nuovo: la riga 9 di questo stesso file
 * diceva che TTFT/PP/TG erano «futuro». Erano futuro perché il cronometro
 * nativo esisteva (`talos_cronometro`, `talos_llama_jni.cpp`) e nessuno lo
 * portava fuori: `talosLocalEngineTimings()` veniva letta e finiva in una
 * riga di log. Questo blocco è il pezzo che mancava — la tracciatura e la
 * misura sono la stessa cosa, e stanno insieme.
 *
 * ⛔ RICERCA PRIMA (regola zero), fonti del 2026-09-10:
 *   - ggml-org/llama.cpp, discussione #14115 «Tutorial: measuring time to
 *     first token (TTFT) and time between tokens»: il TTFT si misura dalla
 *     richiesta al primo token disponibile ed ESCLUDE il caricamento del
 *     modello. ⇒ il nostro cronometro parte a `generate_start`, cioè dopo
 *     `native_open_done`: un caricamento a freddo da dieci secondi non è la
 *     velocità del modello, ed è già tracciato a parte.
 *   - ggml-org/llama.cpp, discussioni #2260/#1323: `prompt eval time` è il
 *     prefill (elaborazione del prompt), `eval time` è la sola generazione,
 *     e i token/s si leggono SOLO sulla seconda. `ms per token` è
 *     `1000 / token-al-secondo` — la stessa identità che si vede nella riga
 *     di PocketPal («103ms/token, 9.69 tokens/sec»).
 *
 * ⛔⛔ QUALE «primo token» — deciso, non subito: il primo token VISIBILE
 * della risposta, non il primo token qualunque. Un modello che ragiona
 * emette token per quaranta secondi prima di dire una parola: dichiarare
 * «300 ms al primo token» mentre lo schermo è fermo sarebbe la stessa
 * famiglia di bugia di «APERTA non è FATTA». Il primo token del MOTORE
 * resta misurato — `engineFirstTokenMs` — perché serve alle fasi dopo per
 * separare «ragiona a lungo» da «parte lento», ma non è il numero che si
 * mostra alla persona.
 */
export interface TalosLocalGenerationMetrics {
    /** L'id che lega queste misure agli eventi della stessa generazione. */
    traceId: string
    /** `Date.now()` a generazione consegnata: serve a non appiccicare misure vecchie a risposte nuove. */
    finishedAt: number
    /** Dal via alla generazione al primo token VISIBILE della risposta. */
    firstVisibleMs: number | null
    /** Solo la fase di generazione, dal cronometro nativo o dal ripiego dell'adattatore. */
    tokensPerSecond: number | null
    msPerToken: number | null
    /** Quanti token ha prodotto il modello, ragionamento incluso. */
    producedTokens: number | null
    /** Il prompt: quanti token e quanto è costato macinarli (prefill). */
    promptTokens: number | null
    prefillMs: number | null
    /** Il primo token QUALUNQUE secondo il motore — diagnosi, non da mostrare. */
    engineFirstTokenMs: number | null
    /**
     * ⭐⭐⭐ Quanti token del prompt il motore ha RITROVATO in memoria invece di
     * rimacinarli, e se ha dovuto buttare via la memoria intera.
     *
     * ## Perché salgono fin quassù, e non restano una diagnosi da log
     *
     * ⛔ In una build di RILASCIO il JNI non scrive niente in logcat: il
     * 2026-09-10 un controllo positivo sul Pad ha trovato **zero righe**
     * `TalosLlama|ggml|llama_` in tutto il buffer, non solo zero righe di
     * rifiuto. ⇒ «non c'è nessun rifiuto nel log» oggi significa «non posso
     * vedere», non «non è successo». Questi due numeri sono l'unica strada
     * che resta perché la persona col telefono in mano possa dirci se la
     * cache KV lavora davvero, e sono la differenza fra sapere e credere: il
     * 10/09 il 2º messaggio di una chat vera è stato **6,9 s più lento** del
     * 1º col modello già caldo, ed è la firma di un prefill che si rifà.
     *
     * ## ⛔ RICERCA PRIMA (regola zero), fonti del 2026-09-10
     *
     *   - ggml-org/llama.cpp, `tools/server/README.md` e discussione #13606
     *     «KV cache reuse with llama-server»: il riuso della cache si misura
     *     **in token**, contando quanti del prompt erano già in memoria
     *     contro quanti sono stati elaborati; il confronto è token per token
     *     e si ferma al primo che diverge. ⇒ il paio (riusati, totale) è la
     *     forma in cui il resto del mondo riporta questa cosa, e la stessa
     *     che mostriamo.
     *   - ggml-org/llama.cpp, issue #21831 «Server forces full prompt
     *     re-processing on subsequent requests (SWA/recurrent memory error)»
     *     e #19794 (Qwen3-Coder-Next ibrido): sulle memorie **ibride o
     *     ricorrenti** la rimozione parziale della sequenza non è
     *     supportata, e il server è costretto a rielaborare il prompt intero
     *     a ogni turno. Non è un difetto nostro ed è **non curabile**
     *     dall'app: è la ragione per cui «zero riusati» da solo non basta e
     *     serve il secondo campo per distinguere i due casi.
     *   - Liquid AI, «LFM2 Technical Report» (arXiv 2511.23404) e la pagina
     *     del modello: LFM2 è un **ibrido** — 18 strati a convoluzione con
     *     stato ricorrente e nessuna KV, 6 a GQA. ⇒ `LFM2.5-2.6B-Q4_0`, il
     *     modello con cui l'owner ha misurato i 32,0 s → 38,9 s, cade
     *     esattamente nella famiglia che quelle issue descrivono.
     *
     * ## ⛔ `null` non è `0`, e qui la differenza è tutta
     *
     * `0` riusati è una misura vera e importante (il primo turno riusa
     * niente per costruzione). `null` vuol dire che il motore non l'ha
     * detto — un ponte nativo più vecchio, o una generazione che non è
     * arrivata al cronometro. Chi mostra questi numeri deve far **sparire**
     * il pezzo nel secondo caso, mai scrivere uno zero che significherebbe
     * l'opposto di ciò che si sa.
     */
    reusedTokens: number | null
    /**
     * Il motore ha rifiutato di tagliare la memoria a metà e l'ha azzerata.
     *
     * ⛔ Distingue due casi che «zero riusati» confonde in uno: il prefisso è
     * cambiato (difetto NOSTRO, curabile) oppure questa architettura non sa
     * fare tagli parziali (non curabile — vedi le fonti qui sopra).
     *
     * ⛔ `null` = il motore non l'ha detto. **Non** «non è successo».
     */
    partialTrimRefused: boolean | null
    /**
     * ⭐⭐⭐ PERCHÉ l'inizio della richiesta era pronto — o perché non lo era.
     *
     * ## Il difetto che questo campo chiude
     *
     * `reusedTokens` dice **quanto** è stato riusato; da solo non dice **perché
     * no**. Misurato sul Pad il 2026-09-10: `LFM2.5-2.6B-Q4_0` **31 s** alla
     * prima parola con **0 token su 2.847** riusati, gemma3 **3,1 s** con
     * **2.933 su 3.257**. La differenza è un file che per LFM2 non viene mai
     * scritto, e fino a oggi non esisteva **nessun posto** dove accorgersene:
     * `talosShouldFreezePrefix` calcolava un motivo che nessuno leggeva, e
     * quattro `return` uscivano muti.
     *
     * ## ⛔ Perché NON è `| null`
     *
     * Ogni generazione locale attraversa `run()`, e `run()` un esito ce l'ha
     * sempre — «non si è potuto ricavare» e «il controllo è fallito» sono
     * esiti, non assenze. Un `null` qui sarebbe la porta da cui il silenzio
     * rientra: si potrebbe dimenticare di passarlo e nessuno se ne
     * accorgerebbe, che è esattamente com'era prima. Obbligatorio ⇒ chi
     * costruisce una misura deve dire com'è andata.
     *
     * ⛔ E NON è un `boolean`. Un campo di comodo che vale sempre lo stesso è
     * già quasi diventato una prova, in questo progetto: undici valori
     * distinti significano che *il valore che vedo è diverso a seconda della
     * causa*, che è la sola cosa che rende il campo un cancello.
     *
     * ## ⛔ L'onestà sul RITARDO, dichiarata
     *
     * L'esito è deciso **in questo turno**, prima che la scrittura parta
     * (`localAdapter.ts`, `decidiPrefisso`), quindi la riga sotto una risposta
     * parla di **quella** risposta. La sola cosa che non può stare nello stesso
     * turno è com'è andata la SCRITTURA, che per costruzione avviene dopo: i
     * suoi due esiti — `engine-refused` e `save-failed` — compaiono al
     * messaggio successivo e **lo dicono nel testo** («la volta scorsa»).
     */
    prefixOutcome: TalosPrefixOutcome
}

/**
 * ⛔ Le misure NON viaggiano coi metadati del messaggio, e non è una scelta
 * estetica: la strada `adattatore → chatCompletion → chatController →
 * negozio` costruisce l'oggetto CAMPO PER CAMPO, e un campo che nessuno
 * copia muore in silenzio a metà ponte — è il difetto «il valore che muore
 * all'ultimo ponte», già pagato in questo progetto. Finché quella catena non
 * porta un canale per le misure (dipendenza dichiarata, non nascosta), il
 * passaggio avviene qui: una coda cortissima che la vista RITIRA quando la
 * risposta compare.
 *
 * ⇒ Conseguenza onesta e voluta: ricaricando la chat la riga sparisce,
 * perché quelle misure non sono mai state scritte su disco. Meglio una riga
 * assente che una riga di zeri — «uno stato mancante e uno stato zero sono
 * due cose diverse».
 */
const misureInAttesa: TalosLocalGenerationMetrics[] = []

/** Il tetto della coda: un turno con strumenti fa più generazioni, non cento. */
const TETTO_MISURE_IN_ATTESA = 8

/**
 * ⛔ Oltre questo, una misura è ORFANA e si butta.
 *
 * Il caso da coprire è il verso contrario: generazione locale interrotta o
 * mai consegnata, e poi un turno con un fornitore a chiave. Senza scadenza
 * quella risposta di rete si prenderebbe i numeri del motore locale — cioè
 * mostrerebbe una velocità che non le appartiene.
 */
const VALIDITA_MISURA_MS = 120_000

export function talosRegistraMisuraLocale(misura: TalosLocalGenerationMetrics): void {
    misureInAttesa.push(misura)
    while (misureInAttesa.length > TETTO_MISURE_IN_ATTESA) misureInAttesa.shift()
}

/**
 * Ritira le misure per la risposta che sta comparendo, e SVUOTA la coda.
 *
 * ⛔ Svuota SEMPRE, anche quando restituisce `null`: chi consuma è «è
 * comparsa una risposta dell'assistente», e una risposta consuma il turno
 * che l'ha prodotta. Lasciare indietro un residuo vorrebbe dire che il
 * messaggio DOPO se lo prende.
 *
 * ⛔ E torna l'ULTIMA, non la prima: in un turno con strumenti le
 * generazioni sono più d'una, e quella che ha prodotto il testo che si legge
 * è l'ultima. Le precedenti hanno prodotto una chiamata, non una risposta.
 */
export function talosRitiraMisuraLocale(adesso: number = Date.now()): TalosLocalGenerationMetrics | null {
    const tutte = misureInAttesa.splice(0, misureInAttesa.length)
    const ultima = tutte.at(-1)
    if (!ultima) return null
    return adesso - ultima.finishedAt <= VALIDITA_MISURA_MS ? ultima : null
}

/** Solo per i test: riporta la coda a com'era prima del turno. */
export function talosScordaMisureLocali(): void {
    misureInAttesa.length = 0
}
