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

// Owner 2026-07-30: the non-immersive bar was too tall. 3rem (48px) is the
// floor rather than a taste — the controls inside are min-h-touch (44px), the
// smallest a touch target may be before taps start missing. Anything shorter
// would have to shrink them, and a slimmer header is not worth a button you
// have to aim at.
// F1-T3 (D5): app-level header — hamburger opens the full-width sidebar,
// centered session title. RIGHT = the 3-dot chat options (owner 2026-07-24:
// "i 3 puntini anche nell'header versione non immersive") — the SAME menu the
// immersive chrome uses, so both shells behave identically.
defineProps<{
    /** The chat on screen is incognito; the menu switch reads the other way. */
    incognito?: boolean
    /** The chat has nothing in it yet, so incognito may be offered (2026-07-31). */
    canGoIncognito: boolean
    title: string
    creatingSession: boolean
    /**
     * A session action is actually RUNNING. Distinct from `creatingSession`,
     * which is also true while persistence is not ready — conflating them made
     * the delete dialog spin over work that had never started.
     */
    sessionBusy?: boolean
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
    /** False before a chat exists; the title then opens nothing, so it is inert. */
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
    <!-- F3-T1 owner: 56px was still too short on device — 96px breathes. -->
    <!-- Owner 2026-07-24: a SOFT fade under the header, not a hard border (like
         Claude). A very-low downward shadow dissolves into the content. -->
    <header
        data-testid="talos-mobile-header"
        class="relative z-10 flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 bg-[var(--talos-header)]/92 px-3 pt-[env(safe-area-inset-top)] shadow-[0_8px_16px_-14px_rgba(0,0,0,0.55)] backdrop-blur"
    >
        <Button
            v-if="!hideMenu"
            type="button"
            size="icon-lg"
            class="min-h-touch min-w-touch"
            variant="ghost"
            data-testid="talos-shell-menu"
            :aria-label="$t('navigation.openMenu')"
            @click="emit('openMenu')"
        >
            <Menu aria-hidden="true" />
        </Button>
        <span v-else class="min-w-touch" aria-hidden="true" />

        <!-- Owner 2026-07-26: the title opens this chat's media, the way a
             messaging app opens chat info. It is a button now, not a <p>: an
             invisible tap target on a paragraph is not an affordance, and the
             same action lives in the ⋮ menu for anyone who never tries it. -->
        <div class="min-w-0 flex-1 text-center">
            <button
                v-if="canOpenMedia"
                type="button"
                data-testid="talos-mobile-header-title"
                aria-haspopup="dialog"
                :aria-label="$t('chat.mediaIn', { title: title.trim() || $t('chat.thisChat') })"
                class="talos-pressable talos-title min-h-touch max-w-full truncate rounded-lg px-2 text-md font-semibold leading-tight text-[var(--talos-text)]"
                @click="emit('media')"
            >
                {{ title.trim() || $t('chat.newChat') }}
            </button>
            <p
                v-else
                data-testid="talos-mobile-header-title"
                class="talos-title truncate text-md font-semibold leading-tight text-[var(--talos-text)]"
            >{{ title.trim() || $t('chat.newChat') }}</p>
        </div>

        <!--
            ⛔ DUE gruppi, non uno: la campanella e i download il pannello del
            tablet ce li ha, le opzioni della chat no. Vedi la nota accanto
            alle proprietà — contarli male si è visto a schermo due volte.
        -->
        <div class="flex shrink-0 items-center">
            <template v-if="!hideAppActions">
                <TalosMobileNotificationBell />
                <TalosMobileDownloadCenterTrigger />
            </template>
            <TalosMobileChatOptionsMenu
                v-if="!hideChatOptions"
                :incognito="incognito"
                :can-go-incognito="canGoIncognito"
                :cleanup-plan="cleanupPlan"
                :active-title="title"
                :busy="sessionBusy ?? creatingSession"
                @new-chat="emit('newChat')"
                @temporary-chat="emit('temporaryChat')"
                @normal-mode="emit('normalMode')"
                @rename="emit('rename', $event)"
                @delete="(choice) => emit('delete', choice)"
                :can-open-media="canOpenMedia"
                @export="emit('export')"
                @media="emit('media')"
            />
            <span v-if="hideAppActions && hideChatOptions" class="min-w-touch" aria-hidden="true" />
        </div>
    </header>
</template>
