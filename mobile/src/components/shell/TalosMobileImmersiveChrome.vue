<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import { Menu } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const TalosMobileNotificationBell = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileNotificationBell.vue'),
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
}>()

const emit = defineEmits<{
    openMenu: []
    newChat: []
    temporaryChat: []
    normalMode: []
    rename: [title: string]
    delete: [{ deleteMedia: boolean }]
    export: []
    /** Owner 2026-07-26: this chat's media gallery. */
    media: []
}>()
</script>

<template>
    <div data-testid="talos-mobile-immersive-chrome" class="pointer-events-none absolute inset-x-0 top-0 z-20">
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
        -->
        <div class="relative pb-6">
            <div
                aria-hidden="true"
                class="absolute inset-0 bg-gradient-to-b from-[var(--talos-background)]/70 via-[var(--talos-background)]/30 to-transparent"
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
            <span v-else aria-hidden="true" />

            <!--
                DUE gruppi, non uno: campanella e download il pannello del tablet
                ce li ha, le opzioni della chat no. Vedi la nota accanto alle
                proprieta.
            -->
            <div class="pointer-events-auto flex shrink-0 items-center">
                <template v-if="!hideAppActions">
                    <TalosMobileNotificationBell />
                    <TalosMobileDownloadCenterTrigger />
                </template>
                <TalosMobileChatOptionsMenu
                    v-if="!hideChatOptions"
                    :incognito="incognito"
                    :can-go-incognito="canGoIncognito"
                    :cleanup-plan="cleanupPlan"
                    :active-title="activeTitle"
                    :busy="busy"
                    pill
                    @new-chat="emit('newChat')"
                    @temporary-chat="emit('temporaryChat')"
                    @normal-mode="emit('normalMode')"
                    @rename="emit('rename', $event)"
                    @delete="(choice) => emit('delete', choice)"
                    :can-open-media="canOpenMedia"
                    @export="emit('export')"
                    @media="emit('media')"
                />
                <span v-if="hideAppActions && hideChatOptions" aria-hidden="true" />
                </div>
            </div>
        </div>
    </div>
</template>
