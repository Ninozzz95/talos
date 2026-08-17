<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { BookMarked, CheckCheck, ChevronRight, CircleAlert, FileText, Mic, ShieldQuestion } from '@lucide/vue'
import { talosShortModelLabel } from '@/lib/models/modelLabel'
import {
    TALOS_METADATA_AZIONI,
    TALOS_METADATA_TRONCATA,
    talosHaAzioniDaMostrare,
} from '@/lib/tools/tracciaAzione'

import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import TalosMobileMessageActions from '@/components/chat/TalosMobileMessageActions.vue'
/*
 * La bolla-immagine arriva col primo messaggio che ne ha una, non all'avvio.
 *
 * Porta con se' il visore a schermo intero e il lettore di provenienza, e la
 * prima schermata di TALOS e' una chat nuova: nessuna immagine, nessun motivo
 * di averli gia' in memoria. Il grafo d'avvio e' a pochi byte dal tetto, e
 * questa e' esattamente la roba che ci va dietro.
 */
const TalosMobileMessageImage = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileMessageImage.vue'),
)
/*
 * ⛔ PIGRA per la stessa ragione della bolla-immagine, e con un numero:
 * statica costava **2.649 byte** al grafo d'avvio, che ha un tetto di 602.200.
 *
 * La prima schermata di TALOS e' una chat nuova: nessuna scheda, nessun motivo
 * di averla gia' in memoria. Arriva col primo messaggio che ne porta una.
 */
const TalosMobileSchedaAzione = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileSchedaAzione.vue'),
)
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import TalosMobileSourcesChip from '@/components/chat/TalosMobileSourcesChip.vue'
import { writeTalosClipboardText } from '@/services/clipboard'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosChatTextSize } from '@/lib/talosChatLayout'
import type { TalosChatBubbleScale } from '@/lib/talosTypes'

const props = defineProps<{
    messages: readonly TalosMobileMessageView[]
    sending: boolean
    modelLabels?: Record<string, string>
    // Desktop-parity message style (owner: assistant replies are full-width
    // sections by default; bubbles remain a Settings toggle).
    messageStyle?: 'sections' | 'bubbles'
    /** Owner 2026-07-25: real chat text size (was a dead preference). */
    textScale?: TalosChatBubbleScale
    /** Defect #4: true while pages above the window remain unloaded. */
    hasOlderMessages?: boolean
    loadingOlderMessages?: boolean
    /**
     * ⛔ Quali richieste di autorizzazione sono ANCORA in attesa, adesso.
     *
     * Serve perche' la riga «una richiesta e' in attesa» e' un messaggio
     * scritto nella trascrizione: una frase CONGELATA che descrive uno stato
     * VIVO. Appena la richiesta viene risolta, la frase resta li' a dire che si
     * sta aspettando — e chi la legge cerca una scheda che non c'e' piu'.
     *
     * Con questo elenco la riga puo' dire la verita' di adesso invece di quella
     * del momento in cui fu scritta.
     */
    pendingAuthorizationIds?: readonly string[]
    /**
     * ⛔ Vero solo se la persona ha acceso la diagnostica: da questo dipende
     * se la striscia di prova mostra anche la riga tecnica (`dumpsys`, i
     * millisecondi). Quelli sono la NOSTRA prova, non la sua lingua.
     */
    diagnostica?: boolean
}>()

const emit = defineEmits<{
    reuse: [messageId: string]
    resend: [messageId: string]
    retry: [messageId: string]
    saveToLibrary: [messageId: string]
    /** La riga dell'attesa e' essa stessa il modo di rispondere. */
    reviewAuthorization: []
}>()

/**
 * L'identificativo del punto di ripresa che questo messaggio annunciava, se
 * questo messaggio annunciava un'attesa.
 */
function checkpointDi(message: TalosMobileMessageView): string | null {
    const id = message.metadata?.tool_authorization_pending_checkpoint_id
    return typeof id === 'string' && id.length > 0 ? id : null
}

/** Vero se quella richiesta e' ancora li' ad aspettare una risposta. */
function attesaViva(message: TalosMobileMessageView): boolean {
    const id = checkpointDi(message)
    return id !== null && (props.pendingAuthorizationIds ?? []).includes(id)
}

/**
 * ⛔ Quante richieste aspettano, per la frase del chip.
 *
 * Prima il numero viaggiava dentro il TESTO del messaggio, perche' la frase
 * gia' tradotta veniva incollata alla risposta del modello. Adesso il testo
 * resta la risposta e basta, quindi il numero deve arrivare dai metadati.
 *
 * ⛔ Il ripiego e' `1` e non `0`: il chip compare solo quando c'e' un'attesa
 * viva, quindi «zero richieste in attesa» sarebbe una frase falsa in un
 * riquadro che esiste proprio perche' una richiesta c'e'. Un metadato mancante
 * e' un'informazione persa, non un'attesa sparita.
 */
function quanteInAttesa(message: TalosMobileMessageView): number {
    const quante = message.metadata?.tool_authorization_pending_count
    return typeof quante === 'number' && Number.isFinite(quante) && quante > 0
        ? Math.round(quante)
        : 1
}

const { t } = useTalosI18n()




/**
 * ⛔ I nomi INTERNI non si mostrano mai: `device_torch` non dice niente a
 * nessuno. Si passa dal catalogo delle etichette, lo stesso che usa la riga
 * dell'attivita' — due nomi per la stessa cosa e' un difetto gia' aperto (#41).
 */
function azioniFatte(metadata: unknown): string[] {
    const righe = (metadata as Record<string, unknown> | null)?.[TALOS_METADATA_AZIONI]
    if (!Array.isArray(righe)) return []
    return righe.map((riga) => {
        const nome = (riga as { tool?: string })?.tool ?? ''
        const chiave = TALOS_TOOL_LABEL_KEYS[nome]
        return chiave ? t(chiave) : nome
    })
}
/**
 * ⛔ La risposta si è fermata perché ha esaurito la lunghezza — rilievo #16b.
 *
 * Solo `true` conta: una chiave assente vuol dire «finita normalmente», e un
 * avviso su ogni risposta insegnerebbe a dubitare anche di quelle intere.
 */
function siEFermataAlLimite(metadata: unknown): boolean {
    return (metadata as Record<string, unknown> | null)?.[TALOS_METADATA_TRONCATA] === true
}

const PlainMessage = defineComponent({
    props: { content: { type: String, required: true } },
    setup(plainProps) {
        return () => h('p', { class: 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' }, plainProps.content)
    },
})
const TalosMobileMessageContent = defineAsyncComponent({
    loader: () => import('@/components/chat/TalosMobileMessageContent.vue'),
    delay: 0,
    loadingComponent: PlainMessage,
})
const TalosMobileBrowserActivity = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileBrowserActivity.vue'),
)
// The streaming subtree owns the UAX #29 tables used by smooth reveal. Keep it
// isolated from the initial app chunk while preserving its direct store
// subscription and the message-list render boundary.
const TalosMobileStreamingReply = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileStreamingReply.vue'),
)
const copyStatus = ref('')

// R1-5 — the in-flight reply lives in TalosMobileStreamingReply, which alone
// subscribes to streamingText: a token burst no longer re-diffs this list.

// R2-11 — ONE row-action grammar (competitor pattern: long-press a message
// for its actions, the same gesture as the chat rows). The hold clicks the
// SAME overflow trigger — no second menu implementation. Trade-off accepted
// per competitor behavior: in-message long-press text selection gives way to
// the actions menu (Copy lives there; code blocks keep their own Copy).
const MESSAGE_HOLD_MS = 500
const MESSAGE_HOLD_SLOP_PX = 10
let messageHoldTimer: ReturnType<typeof setTimeout> | null = null
let messageHoldOrigin: { x: number; y: number } | null = null
let suppressNextMessageClick = false

function clearMessageHold(): void {
    if (messageHoldTimer !== null) clearTimeout(messageHoldTimer)
    messageHoldTimer = null
    messageHoldOrigin = null
}

function onMessagePointerDown(event: PointerEvent): void {
    clearMessageHold()
    messageHoldOrigin = { x: event.clientX, y: event.clientY }
    const article = event.currentTarget as HTMLElement
    messageHoldTimer = setTimeout(() => {
        // Order matters: open the menu FIRST (reka opens on click, proven by
        // TalosMobileMessageActions.test.ts), THEN arm suppression. If we set
        // the flag first, our own programmatic click bubbles through the
        // article's @click.capture guard and gets preventDefault()'d before
        // it reaches reka (root cause of the R2-11 dead menu). Suppression is
        // only for the finger's trailing real click after the hold.
        article.querySelector<HTMLButtonElement>('[data-message-overflow-trigger]')?.click()
        suppressNextMessageClick = true
        clearMessageHold()
    }, MESSAGE_HOLD_MS)
}

function onMessagePointerMove(event: PointerEvent): void {
    if (!messageHoldOrigin) return
    if (Math.abs(event.clientX - messageHoldOrigin.x) > MESSAGE_HOLD_SLOP_PX
        || Math.abs(event.clientY - messageHoldOrigin.y) > MESSAGE_HOLD_SLOP_PX) clearMessageHold()
}

function onMessageClickCapture(event: MouseEvent): void {
    // The click that ends the long-press is part of the gesture.
    if (suppressNextMessageClick) {
        suppressNextMessageClick = false
        event.preventDefault()
        event.stopPropagation()
    }
}

// Meta timestamps age honestly: a shared `now` ticks every 30s so "just now"
// does not persist forever on an idle thread.
const now = ref(new Date())
let nowTicker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
    nowTicker = setInterval(() => { now.value = new Date() }, 30_000)
})
onBeforeUnmount(() => {
    if (nowTicker) clearInterval(nowTicker)
})

// F2-T2 calm thread: consecutive same-sender messages group together —
// tighter gap, tail radius and meta row only on the last of the group.
function isGrouped(index: number): boolean {
    const current = props.messages[index]
    const previous = props.messages[index - 1]
    return Boolean(previous && current.role !== 'system' && previous.role === current.role)
}

function isGroupEnd(index: number): boolean {
    const current = props.messages[index]
    const next = props.messages[index + 1]
    return !next || next.role !== current.role
}

function modelLabel(message: TalosMobileMessageView): string {
    // Attribution is assistant-only: a human never answers "with" a model.
    if (message.role !== 'assistant') return ''
    const id = message.model_profile_id
    if (!id) return ''
    /*
     * Owner 2026-08-06: «spunta tutto il percorso del modello e non solo il
     * nome, stampando una riga enorme sotto la risposta».
     *
     * Il ripiego sull'identificativo esiste per i casi in cui il profilo non
     * c'è — un modello cancellato dopo aver risposto, una chat riaperta prima
     * che il catalogo sia pronto — ed è lì che serve di più: sta dicendo con
     * cosa è stata scritta una risposta che qualcuno rilegge mesi dopo. Deve
     * restare leggibile.
     */
    return props.modelLabels?.[id] ?? talosShortModelLabel(id)
}

// R1-5 — precomputed once per messages change (was findIndex+slice+some PER
// assistant row inside the render: O(n²) each pass).
const hasPreviousUserById = computed(() => {
    const map = new Map<string, boolean>()
    let seenUser = false
    for (const message of props.messages) {
        map.set(message.id, seenUser)
        if (message.role === 'user') seenUser = true
    }
    return map
})

function hasPreviousUser(messageId: string): boolean {
    if (hasPreviousUserById.value.get(messageId) === true) return true
    // Defect #4: the window is paged. An assistant message that OPENS the
    // loaded page usually has its prompt on the page above, so hiding Retry
    // there would make the action blink in and out as you scroll.
    return props.hasOlderMessages === true && props.messages[0]?.id === messageId
}

function hasMemoryDisclosure(message: TalosMobileMessageView): boolean {
    return message.role !== 'system'
        && Array.isArray(message.metadata.used_memories)
        && message.metadata.used_memories.length > 0
}

// Owner 2026-07-29: memory provenance remains per-turn, but repeated pills are
// thread noise. Cache one chronological winner for the materialized window;
// prepending an older page deterministically moves, never duplicates, it.
const firstMemoryDisclosureMessageId = computed(
    () => props.messages.find(hasMemoryDisclosure)?.id ?? null,
)

async function copyMessage(message: TalosMobileMessageView): Promise<void> {
    try {
        await writeTalosClipboardText(message.content)
        copyStatus.value = t('chat.messageCopied')
    } catch {
        copyStatus.value = t('chat.messageCopyFailed')
    }
}

/**
 * Images render as images; everything else keeps the chip.
 *
 * Split here rather than branched inside one loop so the two have different
 * markup entirely — a thumbnail is not a chip with a different icon.
 */
function imageAttachments(message: TalosMobileMessageView) {
    return (message.attachments ?? []).filter((entry) => entry.media_type.startsWith('image/'))
}

function fileAttachments(message: TalosMobileMessageView) {
    return (message.attachments ?? []).filter((entry) => !entry.media_type.startsWith('image/'))
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
    const megabytes = value / (1024 * 1024)
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}

function relativeTime(iso: string): string {
    return talosRelativeTime(iso, now.value, {
        justNow: t('chat.justNow'),
        minutesAgo: count => t('chat.minutesAgo', { count }),
        hoursAgo: count => t('chat.hoursAgo', { count }),
        daysAgo: count => t('chat.daysAgo', { count }),
    })
}

function messageStateLabel(state: string): string {
    if (state === 'pending') return t('chat.statePending')
    if (state === 'failed') return t('chat.stateFailed')
    if (state === 'cancelled') return t('chat.stateCancelled')
    return state
}
</script>

<template>
    <div
        class="mx-auto flex min-w-0 w-full max-w-[820px] flex-col overflow-x-hidden px-3 py-4"
        data-testid="talos-mobile-message-list"
        :data-text-scale="props.textScale ?? 'balanced'"
        :style="{ fontSize: talosChatTextSize(props.textScale) }"
    >
        <!-- Defect #4 (SF): paging had no visible state at all — no spinner and
             no affordance, so on a thread whose first page did not overflow
             there was no way to reach the older messages, and no sign the app
             was working when it was. -->
        <div
            v-if="props.hasOlderMessages"
            data-testid="talos-older-messages"
            class="mb-2 flex items-center justify-center gap-2 text-2xs text-[var(--talos-muted)]"
        >
            <span v-if="props.loadingOlderMessages" class="talos-typing-pulse" aria-hidden="true"></span>
            <span>{{ props.loadingOlderMessages ? $t('chat.loadingEarlier') : $t('chat.scrollEarlier') }}</span>
        </div>

        <article
            v-for="(message, index) in messages"
            :key="message.id"
            :data-message-id="message.id"
            :data-message-kind="message.role"
            :data-state="message.state"
            :data-grouped="isGrouped(index) ? 'true' : undefined"
            class="talos-chat-message flex min-w-0 max-w-full flex-col"
            :class="[message.role === 'user' ? 'items-end' : 'items-start', isGrouped(index) ? 'mt-1' : 'mt-3 first:mt-0']"
            @pointerdown="message.role === 'user' && onMessagePointerDown($event)"
            @pointermove="onMessagePointerMove($event)"
            @pointerup="clearMessageHold()"
            @pointercancel="clearMessageHold()"
            @click.capture="onMessageClickCapture($event)"
        >
            <TalosMobileStatusMessage v-if="message.role === 'system'" :message="message" />
            <template v-else>
                <div
                    class="talos-message-bubble min-w-0 overflow-hidden leading-6"
                    :class="[message.role === 'assistant' && (props.messageStyle ?? 'sections') === 'sections'
                        ? 'w-full max-w-full px-1 py-1 text-[var(--talos-text,var(--foreground))]'
                        : 'max-w-[92%] px-3.5 py-2', message.role === 'user'
                        ? 'bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                        : ((props.messageStyle ?? 'sections') === 'sections'
                            ? ''
                            : 'border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] text-[var(--talos-text,var(--foreground))]'),
                    message.role === 'assistant' && (props.messageStyle ?? 'sections') === 'sections'
                        ? ''
                        : (isGroupEnd(index)
                            ? (message.role === 'user' ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm')
                            : 'rounded-2xl')]"
                    :data-message-kind="message.role"
                >
                    <!-- Defect #5: the model's own reasoning, collapsed, ABOVE
                         the answer — it is how the answer was reached, so
                         putting it after would read backwards. -->
                    <TalosMobileReasoningBlock
                        v-if="message.role === 'assistant' && message.reasoning"
                        :reasoning="message.reasoning"
                    />
                    <!--
                        ⛔ L'attesa si disegna da cio' che e' VERO ADESSO.

                        ## Il difetto, riprodotto sul Pad il 2026-08-08

                        In chat c'era «una richiesta di autorizzazione e' in
                        attesa» e sullo schermo non c'era ne' la scheda ne' il
                        pulsante per richiamarla. Il turno non si chiudeva e lo
                        strumento non partiva.

                        La causa non era una condizione sbagliata: era che
                        quella frase e' un MESSAGGIO, scritto una volta e mai
                        piu' toccato, mentre la scheda e il pulsante vivono
                        sullo stato corrente. Risolta la richiesta, la frase
                        resta — e manda a cercare qualcosa che non esiste.

                        ## Le due meta' della cura

                        Se l'attesa e' viva, la riga e' un BOTTONE: e' la porta,
                        non l'annuncio di una porta altrove. Se non lo e' piu',
                        la riga parla al passato e nessuno la insegue.
                    -->
                    <!-- ⛔ SEGNALINO, NON COMANDO — owner 2026-08-10, seconda
                         passata: «l'icona prima del testo è solo un segnalino
                         per far capire che la chat ha parlato ad alta voce su
                         richiesta… non deve apparire se non si chiede».

                         La prima versione l'aveva fatto diventare un pulsante,
                         e il comando era sparito da sotto: due errori in uno.
                         Il comando sta accanto a «copia», sempre; questo dice
                         soltanto «questa risposta l'hai fatta leggere».

                         ⛔ Icona DIVERSA da quella del comando, e non e' un
                         vezzo: due disegni uguali per una cosa che si preme e
                         una che si guarda insegnano a premere quella sbagliata.

                         ⛔ ALLINEAMENTO PER LINEA DI BASE, misurato sul Pad.

                         Col `mt-1` fisso, e poi anche con `h-[1lh]` e
                         `items-start`, i due rettangoli erano: icona `top 359`,
                         prima riga del testo `top 371` — DODICI pixel di
                         scarto, e non era il margine del paragrafo (`mt: 0`).
                         Un allineamento per BORDO deve indovinare da dove
                         comincia il blocco accanto, e ci sono sempre dodici
                         pixel che non gli hai detto.

                         `items-baseline` non indovina: mette la base
                         dell'icona sulla base della prima riga, che e' la
                         stessa linea su cui poggiano le lettere. Il mezzo
                         `em` di scarto e' il compenso ottico — una `x` poggia
                         sulla base, un cerchio la attraversa.
                    -->
                    <!-- ⛔ ACCANTO, NON SOPRA — owner 2026-08-10, terza passata,
                         con lo SCHERMO in mano: «icona deve essere ACCANTO al
                         testo non sopra». La versione prima metteva il segnalino
                         come fratello del contenuto dentro una colonna, e un
                         contenuto di blocco lo spinge su una riga tutta sua.
                         Il DOM diceva «c'e'» ed era vero; lo screenshot diceva
                         DOVE, ed era sbagliato. Serve la RIGA: icona nella
                         colonnina a sinistra, testo che le sta a fianco.
                         `items-start` la tiene sulla PRIMA riga anche quando la
                         risposta e' lunga. -->
                    <div class="flex min-w-0 max-w-full items-baseline gap-1.5">
<!-- ⭐⭐ IL MICROFONO STA SUL MESSAGGIO DETTATO, non sulla risposta letta.

                         Owner 2026-08-11: «quando premo il pulsante sound
                         spunta l'icona microfono accanto al testo. Questo non
                         deve succedere». Aveva ragione, e la riga di prima era:

                             message.role === 'assistant'
                             && parla.lette.value.has(message.id)

                         cioè il microfono marcava «TALOS ha LETTO questo» — il
                         momento esatto in cui TALOS parla e nessuno sta
                         ascoltando al microfono. Il simbolo giusto sulla cosa
                         sbagliata.

                         ⛔ E mentre TALOS legge non ci va NIENTE al suo posto:
                         il pulsante dell'audio diventa già «Interrompi», e un
                         secondo segno per lo stesso stato è rumore. -->
                        <!--
                            ⛔ IL COLORE DEL TESTO CHE ACCOMPAGNA, non quello
                            della pagina. Owner 2026-08-12: «il colore dell'icona
                            microfono nella bolla di domanda deve avere lo stesso
                            colore del testo, adesso è bianco».

                            Aveva ragione e la causa era `--talos-muted`: un
                            token nato per il testo secondario **sul fondo della
                            pagina**. Dentro la bolla dell'utente il fondo è
                            l'accento e il testo è `--talos-accent-contrast`, così
                            l'icona finiva quasi bianca su ambra — un colore che
                            non appartiene a nessuna delle due parti.

                            ⇒ Stesso token del testo che accompagna, e il grado
                            di «secondario» lo dà l'OPACITÀ invece di un'altra
                            tinta: resta più sommessa della frase senza smettere
                            di essere dello stesso colore, e continua a funzionare
                            se il tema cambia l'accento.
                        -->
                        <span
                            v-if="message.role === 'user' && message.metadata?.dictated === true"
                            data-testid="talos-message-dictated"
                            class="inline-flex shrink-0 translate-y-[0.15em] items-center text-[var(--talos-accent-contrast,var(--primary-foreground))] opacity-70"
                            :title="$t('chat.dictated')"
                            :aria-label="$t('chat.dictated')"
                        >
                            <Mic class="size-4" aria-hidden="true" />
                        </span>
                        <!--
                            ⭐⭐⭐ LA RISPOSTA SI LEGGE SEMPRE, E L'AVVISO E' UN CHIP.

                            ## Il difetto, fotografato dall'owner il 2026-08-17

                            «bisogna levare questo avviso che spunta, dovrebbe
                            spuntare nella chat ma invece si vede questa orribile
                            enorme sezione: e' una cosa che dice la chat ma viene
                            stampata in questo chip».

                            Erano DUE difetti sovrapposti, e il secondo peggiore:

                            1. `chatController` incollava la stringa dell'avviso
                               DENTRO il testo del messaggio (`join('\n\n')`), e
                               questo riquadro mostrava `message.content` — cioe'
                               la prosa del modello PIU' l'avviso, tutto dentro
                               un bottone.
                            2. ⛔ E il bottone stava al posto di
                               `TalosMobileMessageContent`, con un `v-else`.
                               Quindi la risposta del modello non veniva
                               nemmeno renderizzata: niente markdown, niente
                               elenchi, niente grassetti — testo crudo dentro un
                               riquadro bordato. Chi legge non vede un avviso:
                               vede la sua risposta rovinata.

                            ⇒ Le due cose sono due cose. Il messaggio si disegna
                            come qualunque altro, e l'avviso e' un chip SOTTO —
                            piccolo, con la sua frase, toccabile.

                            ⛔ La ricerca sui pattern di chat del 2026 dice la
                            stessa cosa: gli stati pendenti sono elementi
                            separati, mai testo inline, e la carta passa da
                            «pending» a «risolto» senza toccare il messaggio.
                        -->
                        <div class="min-w-0 flex-1">
                            <TalosMobileMessageContent :content="message.content" />
                            <button
                                v-if="attesaViva(message)"
                                type="button"
                                data-testid="talos-authorization-pending-open"
                                class="talos-pressable mt-2 flex min-h-touch w-full items-center gap-2 rounded-xl border border-[var(--talos-accent)]/50 bg-[var(--talos-active)] px-3 text-left text-sm"
                                @click="emit('reviewAuthorization')"
                            >
                                <ShieldQuestion class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                                <span class="min-w-0 flex-1">{{ $t('chat.toolAuthorizationPending', { count: quanteInAttesa(message) }) }}</span>
                                <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </button>
                            <p
                                v-else-if="checkpointDi(message)"
                                data-testid="talos-authorization-pending-done"
                                class="mt-2 text-xs leading-5 text-[var(--talos-muted)]"
                            >{{ $t('chat.toolAuthorizationSettled') }}</p>
                        </div>
                    </div>
                    <!-- Owner 2026-07-26: the "Sources" pill, under the answer
                         and never above it — you read the claim, then check what
                         it rests on. -->
                    <TalosMobileSourcesChip
                        v-if="Array.isArray(message.metadata.sources) && message.metadata.sources.length"
                        :sources="message.metadata.sources as never"
                    />
                    <!-- ⛔⛔ COSA E' STATO FATTO, scritto da TALOS.
                         MISURATO 2026-08-10: col motore locale la torcia si
                         spegne davvero e la chat scrive «the tool_results do
                         not contain what the user asked for». La frase resta
                         quella del modello; questa riga dice cosa e' successo. -->
                    <div
                        v-if="talosHaAzioniDaMostrare(message.metadata)"
                        data-testid="talos-actions-done"
                        class="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
                    >
                        <CheckCheck class="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{{ $t('chat.actionsDone') }}</span>
                        <span class="opacity-80">{{ azioniFatte(message.metadata).join(' · ') }}</span>
                    </div>
                    <!--
                        ⛔⛔ SI È FERMATA A METÀ, e va detto — rilievo #16b.

                        Owner, dagli screenshot del 12 agosto: la risposta
                        appariva troncata a metà frase «senza che si capisca se
                        sia finita, interrotta o tagliata dal rendering».

                        Tre cause con lo stesso aspetto; questa è quella che non
                        aveva voce. Il fatto lo sa solo il provider
                        (`finishReason: 'length'`), viaggia coi metadati come le
                        azioni, e finisce qui — sotto la risposta, dove la
                        persona sta già guardando la frase che si interrompe.

                        ⛔ Non riscrive la frase del modello: aggiunge il pezzo
                        che il modello non poteva sapere.
                    -->
                    <div
                        v-if="siEFermataAlLimite(message.metadata)"
                        data-testid="talos-risposta-troncata"
                        role="status"
                        class="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
                    >
                        <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{{ $t('chat.stoppedAtLimit') }}</span>
                    </div>
                    <!-- ⭐⭐⭐ LE SCHEDE: lo stato con cui si può ancora
                         parlare, non l'esito. Owner 2026-08-13, dopo il testa a
                         testa con Gemini: loro dopo «accendi la torcia»
                         lasciano l'interruttore dentro la chat, noi dicevamo
                         «fatto» e chiudevamo il discorso. -->
                    <TalosMobileSchedaAzione
                        v-if="message.metadata?.cards"
                        :metadata="message.metadata"
                        :diagnostica="diagnostica"
                    />
                    <!-- F4 Memory: one calm-thread disclosure; every injected
                         turn still retains its own auditable metadata. -->
                    <div
                        v-if="message.id === firstMemoryDisclosureMessageId"
                        data-testid="talos-used-memories"
                        class="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
                        :title="(message.metadata.used_memories as Array<{ title?: string }>).map((entry) => entry?.title ?? '').join(' · ')"
                    >
                        <BookMarked class="size-3.5 shrink-0" aria-hidden="true" />
                        {{ (message.metadata.used_memories as unknown[]).length === 1
                            ? $t('chat.memoryUsedOne')
                            : $t('chat.memoryUsedMany', { count: (message.metadata.used_memories as unknown[]).length }) }}
                    </div>
                    <!-- Owner 2026-07-25 Library: injected-doc disclosure stays
                         in metadata and is not repeated as visual chrome. -->
                    <div
                        v-if="message.attachments?.length"
                        class="mt-2 flex max-w-full flex-wrap gap-1.5"
                        role="list"
                        :aria-label="$t('chat.attachedFiles')"
                    >
                        <!-- An image is SHOWN. Owner 2026-07-27: a photo
                             rendered as a chip with its filename is the one
                             thing a photo is not. -->
                        <TalosMobileMessageImage
                            v-for="attachment in imageAttachments(message)"
                            :key="attachment.id"
                            :file-id="attachment.vault_file_id ?? attachment.id"
                            :name="attachment.display_name"
                            role="listitem"
                            :data-message-attachment-id="attachment.id"
                        />
                        <span
                            v-for="attachment in fileAttachments(message)"
                            :key="attachment.id"
                            :data-message-attachment-id="attachment.id"
                            :title="attachment.media_type"
                            role="listitem"
                            class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
                        >
                            <FileText class="size-3.5 shrink-0" aria-hidden="true" />
                            <span class="max-w-[180px] truncate">{{ attachment.display_name }}</span>
                            <span class="shrink-0 opacity-75">{{ formatBytes(attachment.size_bytes) }}</span>
                            <span v-if="attachment.grant_status === 'revoked'" class="shrink-0">{{ $t('chat.accessRevoked') }}</span>
                        </span>
                    </div>
                    <TalosMobileBrowserActivity
                        v-if="message.browserActivities?.length"
                        :activities="message.browserActivities"
                    />
                </div>
                <div v-if="isGroupEnd(index)" class="talos-message-meta mt-1 flex max-w-[92%] items-center gap-1.5 px-1 font-mono text-2xs text-[var(--talos-muted)]">
                    <span>{{ message.role === 'user' ? $t('chat.you') : 'TALOS' }}</span>
                    <template v-if="modelLabel(message)">
                        <span aria-hidden="true">·</span>
                        <span>{{ modelLabel(message) }}</span>
                    </template>
                    <span aria-hidden="true">·</span>
                    <span>{{ relativeTime(message.created_at) }}</span>
                    <template v-if="message.state !== 'persisted'">
                        <span aria-hidden="true">·</span>
                        <span>{{ messageStateLabel(message.state) }}</span>
                    </template>
                </div>
                <!-- SF-critic #7: the action row renders only where the group
                     ends (next to the meta row) — calmer per-turn chrome. -->
                <TalosMobileMessageActions
                    v-if="isGroupEnd(index)"
                    :message="message"
                    :busy="sending"
                    :can-retry="message.role === 'assistant' && hasPreviousUser(message.id)"
                    @copy="copyMessage"
                    @reuse="emit('reuse', $event.id)"
                    @resend="emit('resend', $event.id)"
                    @retry="emit('retry', $event.id)"
                    @save-to-library="emit('saveToLibrary', $event.id)"
                />
            </template>
        </article>

        <!-- R1-5: the streaming tail subscribes to the store on its own — a
             token burst re-renders only that subtree, never this list. -->
        <TalosMobileStreamingReply />
        <span data-testid="talos-mobile-message-action-status" class="sr-only" role="status" aria-live="polite">{{ copyStatus }}</span>
    </div>
</template>
