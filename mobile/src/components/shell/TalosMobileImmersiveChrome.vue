<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'
import { talosSegnaleAggiornamento } from '@/lib/updates/segnaleAggiornamento'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import { ChevronLeft, Menu } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
)
// Il segnale dell'aggiornamento: pigro come il campanello, e montato solo quando c'è qualcosa da dire.
const TalosMobileUpdateSignal = defineAsyncComponent(
    () => import('@/components/updates/TalosMobileUpdateSignal.vue'),
)
const TalosMobileDownloadCenterTrigger = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileDownloadCenterTrigger.vue'),
)
const TalosMobileChatOptionsMenu = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileChatOptionsMenu.vue'),
)

// F2-T3.6 (owner, ChatGPT-style): immersive shell chrome — no solid header bar;
// floating circular pills over a light top fade for scroll continuity. LEFT =
// hamburger (sidebar). RIGHT = 3-dot chat options (New / Rename / Export /
// Delete) — shared with the classic header via TalosMobileChatOptionsMenu.
defineProps<{
    /** The chat on screen is incognito; the menu switch reads the other way. */
    incognito?: boolean
    /** The chat has nothing in it yet, so incognito may be offered (2026-07-31). */
    canGoIncognito: boolean
    activeTitle: string
    busy: boolean
    /**
     * ⛔⛔ F6 — sul tablet il pannello ha l’HAMBURGER, la CAMPANELLA e i
     * DOWNLOAD. Non ha le opzioni della chat.
     *
     * Sono TRE gruppi e non due, e ogni volta che li ho contati male si è
     * visto a schermo:
     *
     *   · Un flag solo per tutti e tre (fino al 2026-08-20 mattina): sul
     *     tablet il riquadro destro non aveva niente — né rinomina, né
     *     elimina, né esporta, né media, né incognito. Nel pannello quelle
     *     voci non ci sono, quindi erano IRRAGGIUNGIBILI.
     *   · Due flag (`hideMenu` + `hideActions`): il riquadro riprendeva
     *     tutto, campanella compresa — e il pannello ce l’ha già.
     *     FOTOGRAFATO lo stesso giorno: due campanelle sullo stesso schermo,
     *     con lo stesso pallino «1».
     *
     * ⇒ Tre proprietà, perché sono tre domande. Ognuna dice esattamente chi
     * possiede quel gruppo altrove, e nessuna si porta dietro le altre.
     */
    hideMenu?: boolean
    /**
     * Campanella e centro download. Il pannello del tablet li ha entrambi:
     * lasciarli anche qui vuol dire due campanelle e due pallini per la
     * stessa notifica.
     */
    hideAppActions?: boolean
    /**
     * Le opzioni della chat — rinomina, elimina, esporta, media, incognito.
     * ⛔ Sul tablet NON si tolgono: nessun’altra superficie le offre.
     */
    hideChatOptions?: boolean
    /** False before a chat exists; the media entry then opens nothing. */
    canOpenMedia?: boolean
    /** What the active chat would take from the Library, for the delete dialog. */
    cleanupPlan?: TalosSessionCleanupPlan
    /** ⭐⭐ P4-ter passo 2 — la chat ha qualcosa da riassumere («Compatta ora» nel menu). */
    canCompact?: boolean
    /**
     * Fase 5 Calm (owner 12/09): sul tablet, con una conversazione aperta, il
     * mockup mette «‹ Indietro» in testa alla chat (topbar r. 2455) — senza
     * pillola del modello e senza tema (U-8/U-9). Sul telefono il posto e'
     * dell'hamburger: le due cose non convivono.
     */
    showBack?: boolean
}>()

const emit = defineEmits<{
    openMenu: []
    /** «‹ Indietro» (tablet, chat aperta): la shell decide dove si torna. */
    back: []
    newChat: []
    temporaryChat: []
    normalMode: []
    rename: [title: string]
    delete: [{ deleteMedia: boolean }]
    export: []
    /** Owner 2026-07-26: this chat's media gallery. */
    media: []
    /** ⭐⭐ P4-ter passo 2 — «Compatta ora», già confermato nel menu. */
    compact: []
}>()

// ⛔ Giudice v2245: «Talos» e il nome del modello finivano sotto pillola e capsula. La barra pubblica quanto occupa ai lati, in px
// dal bordo del SUO riquadro, e quanto è largo il riquadro; talosCalmMessages.css lo toglie alla testa. nomeDelModelloPrimaDellaCapsula.test.ts
// Giudice v2261 (foto vere del Pad): anche il tablet, dove a sinistra c'è «indietro» e il riquadro comincia dopo il pannello.
// Sul telefono il riquadro è lo schermo (sinistra 0, destra = larghezza): gli stessi numeri di prima.
const radice = ref<HTMLElement | null>(null)
const VARIABILI = ['--talos-barra-sinistra', '--talos-barra-destra', '--talos-barra-larghezza']
const togli = () => VARIABILI.forEach((v) => document.documentElement.style.removeProperty(v))
function misura() {
    const azioni = radice.value?.querySelector('[data-testid="talos-immersive-actions"]')
    if (!radice.value || !azioni) return togli()
    const riquadro = radice.value.getBoundingClientRect()
    const tasto = radice.value.querySelector('[data-testid="talos-shell-menu"], [data-testid="talos-chat-back"]')
    const capsula = azioni.getBoundingClientRect()
    const valori = [
        tasto ? Math.ceil(tasto.getBoundingClientRect().right - riquadro.left) + 8 : 0,
        capsula.width > 0 ? Math.ceil(riquadro.right - capsula.left) + 4 : 0,
        riquadro.width,
    ]
    VARIABILI.forEach((v, i) => document.documentElement.style.setProperty(v, `${valori[i]}px`))
}
let osservatore: ResizeObserver | undefined
onMounted(() => {
    misura()
    if (typeof ResizeObserver === 'undefined' || !radice.value) return
    osservatore = new ResizeObserver(misura)
    for (const e of [radice.value, radice.value.querySelector('[data-testid="talos-immersive-actions"]')]) if (e) osservatore.observe(e)
})
onUpdated(misura)
onBeforeUnmount(() => { osservatore?.disconnect(); togli() })
</script>

<template>
    <div ref="radice" data-testid="talos-mobile-immersive-chrome" class="pointer-events-none absolute inset-x-0 top-0 z-20">
        <!--
            ⛔⛔ IL VELO ARRIVA DOVE ARRIVANO I COMANDI, e non un pixel prima.

            MISURATO sul Pad il 2026-08-10, in viewport telefono:

                velo (sfumatura)      0 → 64 px
                «Apri menu»          40 → 88 px    ← 24 px di pulsante su fondo NUDO

            Il velo era alto `4rem` scritto a mano, i tondi arrivano più in
            basso: la parte finale del pulsante stava direttamente sopra il
            testo della conversazione, e la bolla del messaggio passava sotto
            senza niente in mezzo. Nella cattura si legge «Cosa puoi controllare
            sel mio telef…», col resto tagliato dal tondo di destra.

            ⇒ `inset-0` invece di un'altezza: il velo eredita l'altezza VERA
            della riga dei comandi, quindi non può più restare indietro se un
            giorno i tondi crescono o si aggiunge una seconda riga. È la regola
            del «niente scritto a mano»: se è una misura, si misura.

            ⛔ La `pb` non è decorazione: è la coda della sfumatura, lo spazio in
            cui il fondo diventa trasparente. Senza, il velo finirebbe di netto
            e si vedrebbe il bordo.
        -->
        <!--
            ⛔ Owner 2026-08-27, misurato via CDP sul Pad: il velo precedente
            (`from-40%`) era un BLOCCO PIENO opaco per il primo 40% della sua
            altezza, poi un salto secco al 70%, poi la sfumatura — non un fade,
            un rettangolo grigio con un bordo. Il testo che ci scorreva sotto
            spariva di netto e ricompariva leggibile-ma-sporco esattamente
            sul bordo. Confrontato con ChatGPT (owner, screenshot): loro non
            hanno nessun blocco, solo pillole isolate su nero nudo.

            ⛔⛔ Owner, correzione esplicita: NIENTE `backdrop-filter: blur`. Il
            testo che scorre sotto deve restare LEGGIBILE, solo attenuato dalla
            trasparenza — un velo, non una sfocatura. Tre fermate distribuite
            in automatico (0/50/100%) bastano per un'interpolazione continua
            dal pieno al trasparente, senza bordo.

            ⛔ Owner 2026-08-27 (secondo giro): NON parlava della chat sotto —
            parlava della STATUS BAR VERA del telefono, che vive proprio in
            cima a questa sfumatura (`env(safe-area-inset-top)`, dentro il
            padding qui sotto). `/70 → /30` era troppo chiaro esattamente lì:
            l'orologio/le icone di sistema perdevano contrasto contro
            qualunque colore ci scorresse dietro (es. una bolla ambra). Portato
            a `/92 → /60`, sempre un fade a tre fermate, MAI blur.

            ⛔ Owner 2026-08-27 (terzo giro): il velo era troppo ALTO — la coda
            della sfumatura (`pb-6`, 24px) scendeva troppo sotto la riga delle
            icone. Ridotta a `pb-2` (8px): la sfumatura comincia prima, e la
            parte piena in cima resta compatta invece di allungarsi verso il
            contenuto della chat.
        -->
        <div class="relative pb-2">
            <div
                aria-hidden="true"
                class="absolute inset-0 bg-gradient-to-b from-[var(--talos-background)]/92 via-[var(--talos-background)]/60 to-transparent"
            />
            <div class="relative flex items-start justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <Button
                v-if="!hideMenu"
                type="button"
                size="icon-lg"
                variant="ghost"
                data-testid="talos-shell-menu"
                :aria-label="$t('navigation.openMenu')"
                class="talos-pressable pointer-events-auto min-h-touch min-w-touch rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur"
                @click="emit('openMenu')"
            >
                <Menu aria-hidden="true" />
            </Button>
            <Button
                v-else-if="showBack"
                type="button"
                size="icon-lg"
                variant="ghost"
                data-testid="talos-chat-back"
                :aria-label="$t('navigation.goBack')"
                class="talos-pressable pointer-events-auto min-h-touch min-w-touch rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur-sm text-[var(--talos-text)]"
                @click="emit('back')"
            >
                <ChevronLeft aria-hidden="true" />
            </Button>
            <span v-else aria-hidden="true" />

            <!--
                DUE gruppi, non uno: campanella e download il pannello del tablet
                ce li ha, le opzioni della chat no. Vedi la nota accanto alle
                proprieta.

                ⛔ UNA CAPSULA SOLA (owner 19/11 09:10, variante A del bozzetto
                BOZZETTO-BARRA-DEL-TELEFONO-2026-11-18): campanella, freccia e
                download non avevano fondo e galleggiavano sul velo trasparente;
                la riga «modello · ora» della risposta, allineata a destra, ci
                scorreva sotto e si leggeva FRA le icone. Ora stanno con le
                opzioni in una capsula coi colori della pillola di oggi. Il velo
                non cambia (scelta dell'owner del 27/08).
                Giudice v2245: il filo è un anello DENTRO (`ring-inset`): un bordo
                aggiungeva 2 px e la capsula era alta 50 contro i 48 della pillola.
                Lo stato premuto delle opzioni è tondo come la capsula, solo qui.
            -->
            <div
                data-testid="talos-immersive-actions"
                class="pointer-events-auto flex shrink-0 items-center"
                :class="hideAppActions && hideChatOptions ? '' : 'rounded-full ring-1 ring-inset ring-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 text-[var(--talos-text)] backdrop-blur [&>button]:text-[var(--talos-text)] [&_[aria-haspopup=menu]]:rounded-full'"
            >
                <template v-if="!hideAppActions">
                    <TalosMobileNotificationBell /><TalosMobileUpdateSignal v-if="talosSegnaleAggiornamento.visibile" />
                    <TalosMobileDownloadCenterTrigger />
                </template>
                <TalosMobileChatOptionsMenu
                    v-if="!hideChatOptions"
                    :incognito="incognito"
                    :can-go-incognito="canGoIncognito"
                    :cleanup-plan="cleanupPlan"
                    :active-title="activeTitle"
                    :busy="busy"
                    @new-chat="emit('newChat')"
                    @temporary-chat="emit('temporaryChat')"
                    @normal-mode="emit('normalMode')"
                    @rename="emit('rename', $event)"
                    @delete="(choice) => emit('delete', choice)"
                    :can-open-media="canOpenMedia"
                    @export="emit('export')"
                    @media="emit('media')"
                    :can-compact="canCompact"
                    @compact="emit('compact')"
                />
                <span v-if="hideAppActions && hideChatOptions" aria-hidden="true" />
                </div>
            </div>
        </div>
    </div>
</template>
