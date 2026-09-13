<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import type { TalosLocalGenerationMetrics } from '@/lib/chat/providers/localTrace'
import type { TalosPrefixOutcome } from '@/lib/models/prefixCache'
import { useSettingsStore } from '@/stores/settings'

/**
 * ⭐⭐⭐ FASE 2 — la riga che dice quanto è andato veloce il motore di QUESTA
 * risposta.
 *
 * ## Da dove viene
 *
 * Owner 2026-09-10, con uno screenshot di PocketPal: sotto ogni risposta c'è
 * `103ms/token, 9.69 tokens/sec, 351ms TTFT`. TALOS non aveva niente del
 * genere, e non è ornamento: senza questa riga nessuna delle fasi che
 * seguono — quelle che devono rendere veloce il motore locale — è
 * verificabile da chi usa l'app. È la sonda che rende onesto il resto.
 *
 * ## Perché queste tre e in quest'ordine
 *
 * Prima il tempo di attesa (è ciò che la persona ha vissuto), poi la
 * velocità, poi il suo reciproco. ⛔ `ms per token` e `tokens/sec` sono la
 * stessa misura scritta due volte — `1000 / t/s`, identità confermata dalla
 * riga di PocketPal e dalla discussione #14115 di llama.cpp letta il
 * 2026-09-10. Si mostrano entrambi perché due persone diverse leggono la
 * velocità in due modi, non perché siano due dati.
 *
 * ## ⛔ Mai uno zero al posto di un dato che manca
 *
 * Ogni pezzo compare solo se è stato MISURATO. Un motore che non ha mandato i
 * tempi, o una risposta di un solo token (da cui una velocità non si ricava),
 * tolgono il pezzo — non lo mettono a zero. Zero direbbe «fermo», che è falso,
 * ed è la stessa famiglia di bugia di `ok:false` su un elenco vero. Se non
 * resta nessun pezzo, la riga intera non c'è.
 *
 * ## ⛔ Niente nomi tecnici a schermo
 *
 * Non «TTFT», non «pp/tg», non `ttft_ms`: «to first token», «tokens/sec»,
 * «ms per token». La persona davanti non è chi ha scritto il motore.
 *
 * ## ⛔ Perché questo file è caricato a richiesta, e cosa NON si può spostarci
 *
 * `TalosMobileMessageList.vue` lo monta con `defineAsyncComponent`: misurato il
 * 2026-09-10, statico pesava 2.432 byte nel grafo d'avvio e faceva sforare il
 * tetto del cancello. ⛔ Quindi qui dentro non va MAI niente che serva a
 * decidere se la riga esiste: quella decisione (il legame misura→messaggio) sta
 * in `useTalosLocalMetrics.ts`, che resta nel grafo statico apposta — se
 * scendesse qui, il chunk andrebbe caricato per ogni messaggio solo per
 * scoprire che non c'è niente da mostrare, cioè la pigrizia si annullerebbe da
 * sola.
 *
 * ## Lo stile
 *
 * Nessun colore d'accento, nessun bordo, nessun pannello: `--talos-muted` su
 * `text-2xs`, gli stessi della riga «TALOS · modello · ora» che sta appena
 * sopra — di cui questa è la continuazione, non un riquadro nuovo.
 */
/**
 * ⛔ `null` è un valore lecito, non un errore del chiamante: la stragrande
 * maggioranza delle risposte non ha misure — tutte quelle dei fornitori a
 * chiave, e quelle locali di ieri, che non sono su disco. Chi mostra il
 * messaggio non deve doversi ricordare di controllarlo prima.
 */
const props = defineProps<{ misure: TalosLocalGenerationMetrics | null }>()

const { t } = useTalosI18n()

/**
 * ⭐⭐⭐ L'interruttore che c'è GIÀ, letto dove lo leggono già gli altri.
 *
 * `Diagnostica → Avanzate → «Mostra dettagli tecnici»`, cioè
 * `shell.debug_diagnostics`: la stessa identica espressione di
 * `ChatScreen.vue:1297` e di `DoctorScreen.vue`, non una seconda preferenza.
 * Quell'interruttore è nato per questo — la sua didascalia dice «registra la
 * durata di ogni invio… altrimenti è solo rumore» — e i due numeri del riuso
 * della cache sono esattamente quel rumore per chi non li ha chiesti.
 *
 * ⛔ Perché letto dallo store e non ricevuto come proprietà: la proprietà
 * `diagnostica` esiste già e scende da `ChatScreen` a `TalosMobileMessageList`
 * fino alla scheda di prova, ma quei due file non sono di questa lane e un
 * campo in più su quella catena è la strada dove in questo progetto un valore
 * è già morto in silenzio («il valore che muore all'ultimo ponte»). Lo store è
 * un singleton reattivo: la lettura è la stessa, la catena no.
 *
 * ⛔ E NON decide se la riga esiste — quella decisione resta dove stava, nel
 * `v-if` della lista, che è ciò che tiene onesta la pigrizia di questo chunk.
 */
const settings = useSettingsStore()
const dettagliTecnici = computed(() => settings.state.shell?.debug_diagnostics === true)

/**
 * Sotto il secondo si contano i millisecondi, sopra si contano i secondi.
 *
 * ⛔ «8.417 ms» è un numero che nessuno legge come un'attesa. Il cambio di
 * unità non è cosmesi: è la differenza fra un dato e una cifra.
 */
function tempo(ms: number): string {
    return ms < 1000
        ? t('chat.localSpeedMilliseconds', { value: String(Math.round(ms)) })
        : t('chat.localSpeedSeconds', { value: (ms / 1000).toFixed(1) })
}

/**
 * ⭐⭐⭐ QUANTO DEL PROMPT ERA GIÀ IN MEMORIA — e se il motore l'ha buttata.
 *
 * ## Perché esiste, e perché non poteva restare un numero interno
 *
 * Owner, misurato sul Pad il 2026-09-10 con `LFM2.5-2.6B-Q4_0`: 1º messaggio
 * **32,0 s** alla prima parola, 2º messaggio **38,9 s** col modello **già
 * caldo**. ⛔ Peggiorato di 6,9 s: quei secondi non sono l'apertura del
 * modello, sono il prefill del prompt che si rifà da capo. Se la cura della
 * cache KV di quel giorno arrivi davvero al motore lo dicono questi due
 * numeri e nient'altro — e in una build di rilascio il JNI non scrive in
 * logcat, quindi non c'era nessun altro modo di guardarli.
 *
 * ## ⛔ Dietro l'interruttore, e in lingua umana
 *
 * Sono numeri da chi ha scritto il motore, su una superficie da persona
 * normale. Compaiono **solo** con «Mostra dettagli tecnici» acceso, e nemmeno
 * lì si scrivono i nomi interni: mai `partialTrimRefused`, mai `seq_rm`, mai
 * «KV». «prompt tokens reused» e «cache reset by the engine» dicono la stessa
 * cosa a chi deve segnalarci un problema.
 *
 * ## ⛔ Le tre assenze, che sono tre cose diverse
 *
 *   - riuso non riportato dal motore  ⇒ il pezzo **non c'è** (mai «0 reused»,
 *     che direbbe «non ha riusato niente» invece di «non lo so»);
 *   - riuso riportato **a zero**      ⇒ il pezzo **c'è** e dice zero, perché è
 *     una misura vera: il primo turno riusa niente per costruzione, e uno zero
 *     al secondo turno è precisamente il difetto da vedere;
 *   - rifiuto non riportato o falso   ⇒ nessun avviso. L'avviso appare solo su
 *     un `true` esplicito: accusare il motore quando non si sa sarebbe la
 *     stessa bugia al contrario.
 */
const riusoDellaCache = computed<string[]>(() => {
    if (props.misure === null || !dettagliTecnici.value) return []
    const pezzi: string[] = []
    const { reusedTokens, promptTokens, partialTrimRefused } = props.misure
    if (reusedTokens !== null && promptTokens !== null) {
        pezzi.push(t('chat.localSpeedPromptReuse', {
            reused: String(reusedTokens),
            total: String(promptTokens),
        }))
    }
    if (partialTrimRefused === true) pezzi.push(t('chat.localSpeedCacheReset'))
    return pezzi
})

/**
 * ⭐⭐⭐ PERCHÉ l'inizio della richiesta era pronto — o perché non lo era.
 *
 * ## Il difetto che questa riga chiude
 *
 * Sopra si legge «0 token della richiesta su 2847 riusati». Fino a oggi
 * finiva lì: il motivo esisteva — `talosShouldFreezePrefix` calcolava un
 * `reason` — e non lo leggeva nessuno (grep del 2026-09-10: zero lettori),
 * mentre nell'adattatore quattro `return` uscivano muti. Sul Pad, LFM2.5-2.6B
 * ci metteva **31 s** alla prima parola contro i **3,1 s** di gemma3, e non
 * c'era **nessun posto** dove accorgersi del perché.
 *
 * ## ⛔ La tabella sta QUI, non nell'adattatore
 *
 * Questo componente è caricato con `defineAsyncComponent` (vedi in testa al
 * file): un dizionario di undici chiavi vive fuori dal grafo d'avvio, dove il
 * tetto del cancello ha meno di un kilobyte di margine. Nell'adattatore resta
 * il solo codice — una stringa corta — che è ciò che deve viaggiare.
 *
 * ## ⛔ `Record` completo, non uno `switch` con un ramo di scorta
 *
 * Il tipo obbliga a coprire tutti gli undici casi: aggiungerne uno senza dargli
 * una frase **non compila**. Un `default: return ''` avrebbe rimesso il
 * silenzio esattamente dove lo stiamo togliendo.
 */
const FRASE_DELL_INIZIO: Record<TalosPrefixOutcome, string> = {
    'reused': 'chat.localSpeedOpeningReused',
    'not-reused': 'chat.localSpeedOpeningNotReused',
    'preparing': 'chat.localSpeedOpeningPreparing',
    'engine-refused': 'chat.localSpeedOpeningEngineRefused',
    'save-failed': 'chat.localSpeedOpeningSaveFailed',
    'unknown-shape': 'chat.localSpeedOpeningUnknownShape',
    'too-short': 'chat.localSpeedOpeningTooShort',
    'no-space': 'chat.localSpeedOpeningNoSpace',
    'too-large': 'chat.localSpeedOpeningTooLarge',
    'unavailable': 'chat.localSpeedOpeningUnavailable',
    'check-failed': 'chat.localSpeedOpeningCheckFailed',
}

/**
 * ⛔ Su una riga sua, e senza il puntino di separazione.
 *
 * I tre numeri sono pari fra loro; questa è una frase che ne SPIEGA uno. Messa
 * in fila col `·` sembrerebbe un quarto dato, e una prosa lunga fra due cifre
 * corte rende illeggibili entrambe. `basis-full` dentro il `flex-wrap` la manda
 * a capo da sola, senza un secondo contenitore e senza un secondo stile: stesso
 * colore, stesso corpo, gerarchia data dalla posizione.
 */
const spiegazioneDellInizio = computed<string | null>(() => {
    if (props.misure === null || !dettagliTecnici.value) return null
    /*
     * ⛔ Il `??` non è pigrizia, ed è l'unico ramo non coperto dal tipo: un
     * codice sconosciuto può arrivare solo se qualcuno viola il contratto, e la
     * scelta è fra far cadere il rendering dell'intera lista dei messaggi e
     * dire l'unica cosa vera che resta — «il controllo non è riuscito», che è
     * esattamente ciò che è successo. Non è un silenzio: è l'esito onesto di
     * «non lo so», che è già uno degli undici.
     */
    const chiave = FRASE_DELL_INIZIO[props.misure.prefixOutcome]
        ?? 'chat.localSpeedOpeningCheckFailed'
    return t(chiave)
})

/**
 * ⭐⭐⭐ UN NUMERO SOLO DI SERIE — owner, 2026-09-10: *«di default, se il modello
 * e' locale, mostra i token al secondo; il resto solo con lo switch
 * diagnostico»*.
 *
 * ## Perche' proprio quello, e non il tempo alla prima parola
 *
 * Sono numeri che rispondono a due domande diverse, e solo una e' della persona
 * che sta leggendo. **«Token al secondo» e' la velocita' di questo modello su
 * questo telefono**: non cambia da un messaggio all'altro, non ha bisogno di
 * contesto, e se un giorno diventa la meta' si vede subito che qualcosa e'
 * cambiato. E' l'unico dei tre che si possa leggere senza sapere com'e' fatto
 * il motore.
 *
 * Gli altri due sono **diagnosi**: il tempo alla prima parola dipende da quanto
 * era gia' in memoria (oggi va da 33,9 s a 4,3 s per lo stesso modello — vedi
 * `.claude/LEDGER-VELOCITA-MOTORE-LOCALE-2026-09-10.md` §35), e i «ms per token»
 * sono lo stesso dato dei token al secondo scritto al contrario. Mostrarli
 * sempre e' rumore che insegna a ignorare la riga.
 *
 * ⛔ E un numero solo NON ha bisogno di un'etichetta diversa: «16,3 token al
 * secondo» e' gia' una frase completa. Accorciarlo in «16,3 t/s» perche' e'
 * rimasto da solo scambierebbe la brevita' per chiarezza — e i separatori
 * spariscono da se', perche' non c'e' piu' niente da separare.
 */
const parti = computed<string[]>(() => {
    const pezzi: string[] = []
    if (props.misure === null) return pezzi
    const { firstVisibleMs, tokensPerSecond, msPerToken, engineFirstTokenMs } = props.misure
    if (firstVisibleMs !== null && dettagliTecnici.value) {
        pezzi.push(t('chat.localSpeedFirstToken', { value: tempo(firstVisibleMs) }))
    }
    /**
     * ⭐⭐⭐ IL SECONDO OROLOGIO — e senza di lui il primo si legge male.
     *
     * ## Sono due metriche diverse, e hanno due nomi
     *
     * «Alla prima parola» e' il tempo fino al primo token **visibile**: dopo
     * che il modello ha finito di pensare. La letteratura lo chiama **TTFV**, e
     * dice che sui modelli che ragionano diverge dal **TTFT** — il primo token
     * in assoluto — «di decine di secondi»
     * (https://tianpan.co/blog/2026/04/23/ttft-latency-slo-streaming-reasoning-models,
     * letto il 2026-09-10). Artificial Analysis misura il TTFT contando il
     * primo token **di ragionamento**
     * (https://artificialanalysis.ai/methodology/performance-benchmarking,
     * letto il 2026-09-10).
     *
     * ⛔ E PocketPal misura il TTFT: ferma il cronometro al primo `content`
     * **oppure** `reasoningContent` (`useChatSession.ts:302-306`). ⇒ Il loro
     * «351 ms» e il nostro «4,3 s» **non sono lo stesso numero**, e finche' si
     * vede solo il secondo il confronto e' scorretto — contro di noi.
     *
     * ## Perche' due numeri e non una differenza
     *
     * La differenza sarebbe un'interpretazione: direbbe «questo tempo e'
     * ragionamento» quando puo' essere anche il ponte, o il filtro che trattiene
     * il testo. Due orologi accanto lasciano il conto a chi guarda e non
     * affermano una causa che non abbiamo misurato.
     *
     * Il numero c'e' gia': il JNI lo riporta come `firstTokenMs` e
     * `localAdapter` lo mette in `engineFirstTokenMs` — e fin qui **nessuna
     * schermata lo mostrava**. Terza volta oggi che un dato misurato non
     * arrivava a nessuno.
     */
    if (engineFirstTokenMs !== null && dettagliTecnici.value) {
        pezzi.push(t('chat.localSpeedEngineFirstToken', { value: tempo(engineFirstTokenMs) }))
    }
    if (tokensPerSecond !== null) {
        pezzi.push(t('chat.localSpeedTokensPerSecond', { value: tokensPerSecond.toFixed(1) }))
    }
    if (msPerToken !== null && dettagliTecnici.value) {
        pezzi.push(t('chat.localSpeedMsPerToken', { value: String(Math.round(msPerToken)) }))
    }
    pezzi.push(...riusoDellaCache.value)
    return pezzi
})

/**
 * Il prefill, per chi lo cerca.
 *
 * ⛔ NON nella riga: elaborare il prompt e generare sono due lavori a due
 * velocità, e le fasi successive del piano hanno bisogno di distinguerli —
 * ma quattro numeri su una riga di telefono non si leggono più. Sta nel
 * titolo, dove non toglie spazio a niente; il posto vero, quando servirà, è
 * un cassetto come quello del ragionamento.
 */
const dettaglio = computed<string | undefined>(() => {
    if (props.misure === null) return undefined
    const { promptTokens, prefillMs } = props.misure
    if (promptTokens === null || prefillMs === null) return undefined
    return t('chat.localSpeedPromptDetail', {
        tokens: String(promptTokens),
        time: tempo(prefillMs),
    })
})
</script>

<template>
    <p
        v-if="parti.length > 0 || spiegazioneDellInizio !== null"
        data-testid="talos-local-metrics"
        class="talos-local-metrics mt-0.5 flex max-w-[92%] flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 font-mono text-2xs text-[var(--talos-muted)]"
        :title="dettaglio"
    >
        <!--
            ⛔ Una didascalia NASCOSTA, non un `aria-label`.

            Ci ero cascato scrivendolo: `aria-label` su un elemento di testo
            SOSTITUISCE il testo per chi usa un lettore di schermo — avrebbe
            letto «velocità di questa risposta» e taciuto i tre numeri, cioè
            avrebbe tolto proprio la cosa. Così invece li introduce.
        -->
        <span class="sr-only">{{ $t('chat.localSpeedLabel') }}</span>
        <template v-for="(parte, indice) in parti" :key="parte">
            <span v-if="indice > 0" aria-hidden="true">·</span>
            <span>{{ parte }}</span>
        </template>
        <span
            v-if="spiegazioneDellInizio !== null"
            data-testid="talos-local-metrics-opening"
            class="basis-full"
        >{{ spiegazioneDellInizio }}</span>
    </p>
</template>
