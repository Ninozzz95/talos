<script setup lang="ts">
/**
 * Il campanello: la metà del centro notifiche che RESTA.
 *
 * La ricerca è netta sulla forma: un centro notifiche ha due metà, il registro
 * che si rivisita e il toast che passa. «Il toast dice ADESSO, il registro dice
 * DOPO.» Finora esisteva solo la prima metà — gli eventi entravano nel registro
 * e nessuno poteva guardarlo, che è come non averlo.
 *
 * ## Perché un popover accanto ai download e non una pagina
 *
 * Perché è la stessa domanda del centro download — «cosa è successo mentre non
 * guardavo» — e sta nello stesso posto con la stessa grammatica. Una pagina
 * costringerebbe a lasciare quello che si sta facendo per leggere una riga.
 *
 * ## Il campanello sparisce quando non c'è niente
 *
 * Come il centro download. Un'icona sempre accesa che non porta mai niente
 * diventa invisibile per abitudine, e il giorno che ha qualcosa da dire nessuno
 * la guarda più.
 */
import { computed, ref, watch } from 'vue'
import { Bell, Check, X } from '@lucide/vue'
import {
    PopoverContent,
    PopoverPortal,
    PopoverRoot,
    PopoverTrigger,
} from 'reka-ui'
import { useTalosI18n } from '@/i18n'
import { talosNotifications, talosMarkNotificationsSeen } from '@/stores/notificationCentre'
import { talosRelativeTime } from '@/lib/relativeTime'

const { t } = useTalosI18n()
const open = ref(false)

const entries = computed(() => talosNotifications.entries)
const unread = computed(() => talosNotifications.unread)
const visible = computed(() => entries.value.length > 0)

const labels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))

function quando(at: number): string {
    return talosRelativeTime(new Date(at).toISOString(), new Date(), labels.value)
}

/**
 * Aprire È aver visto.
 *
 * Un numero che resta acceso dopo che hai guardato è un debito che non si
 * estingue, e l'unico rimedio che resta è ignorarlo per sempre. Si segna alla
 * CHIUSURA e non all'apertura, così le voci restano evidenziate finché il
 * pannello è aperto e si distingue ciò che era nuovo da ciò che c'era già.
 */
watch(open, (adesso, prima) => {
    if (prima && !adesso) talosMarkNotificationsSeen()
})
</script>

<template>
    <PopoverRoot v-if="visible" v-model:open="open">
        <PopoverTrigger as-child>
            <button
                type="button"
                data-testid="talos-notification-bell"
                :aria-label="t('notifications.open', { count: unread })"
                class="talos-pressable pointer-events-auto relative inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-[var(--talos-radius-control)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)] hover:text-[var(--talos-text)]"
            >
                <Bell class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                <!-- Il numero solo se c'è qualcosa da vedere: un pallino sempre
                     acceso smette di significare «guardami». -->
                <span
                    v-if="unread > 0"
                    data-testid="talos-notification-unread"
                    class="absolute right-0 top-0 grid min-h-[var(--talos-space-section)] min-w-[var(--talos-space-section)] place-items-center rounded-full bg-[var(--talos-accent)] px-[calc(var(--talos-space-inline)/2)] font-mono text-3xs font-semibold text-[var(--talos-accent-contrast)]"
                    aria-hidden="true"
                >{{ unread }}</span>
            </button>
        </PopoverTrigger>

        <PopoverPortal>
            <PopoverContent
                data-testid="talos-notification-centre"
                align="end"
                :side-offset="8"
                :collision-padding="12"
                data-talos-motion-intent="menu-open"
                class="isolate z-[100] w-[min(24rem,calc(100vw-(var(--talos-space-page)*2)))] overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)] outline-none"
            >
                <header class="flex min-w-0 items-center gap-[var(--talos-space-inline)] p-[var(--talos-space-card)]">
                    <span class="grid size-[var(--talos-touch-target)] shrink-0 place-items-center rounded-[var(--talos-radius-control)] bg-[var(--talos-active)] text-[var(--talos-accent)]">
                        <Bell class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </span>
                    <div class="min-w-0 flex-1">
                        <h2 class="talos-title text-sm font-semibold">{{ t('notifications.title') }}</h2>
                        <p class="text-2xs text-[var(--talos-muted)]">
                            {{ unread > 0 ? t('notifications.unread', { count: unread }) : t('notifications.allSeen') }}
                        </p>
                    </div>
                    <button
                        v-if="unread > 0"
                        type="button"
                        data-testid="talos-notification-mark-all"
                        :aria-label="t('notifications.markAll')"
                        class="talos-pressable grid min-h-touch min-w-touch place-items-center rounded-[var(--talos-radius-control)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)]"
                        @click="talosMarkNotificationsSeen()"
                    >
                        <Check class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        :aria-label="t('common.close')"
                        class="talos-pressable grid min-h-touch min-w-touch place-items-center rounded-[var(--talos-radius-control)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)]"
                        @click="open = false"
                    >
                        <X class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </button>
                </header>

                <!-- Scorre invece di crescere: duecento voci non devono poter
                     spingere il pannello fuori dallo schermo. -->
                <ul class="max-h-[min(24rem,60vh)] overflow-y-auto border-t border-[var(--talos-border)]">
                    <li
                        v-for="voce in entries"
                        :key="voce.key"
                        data-testid="talos-notification-entry"
                        class="flex min-w-0 flex-col gap-[calc(var(--talos-space-inline)/2)] border-b border-[var(--talos-border)] p-[var(--talos-space-card)] last:border-b-0"
                        :class="voce.read ? '' : 'bg-[var(--talos-active)]/40'"
                    >
                        <div class="flex min-w-0 items-baseline gap-[var(--talos-space-inline)]">
                            <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ voce.title }}</span>
                            <span class="shrink-0 text-3xs text-[var(--talos-muted)]">{{ quando(voce.at) }}</span>
                        </div>
                        <p v-if="voce.body" class="line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">
                            {{ voce.body }}
                        </p>
                        <!-- Quante volte la stessa cosa si è ripetuta. Detto,
                             non nascosto: dieci aggiornamenti collassati in una
                             riga sono un'informazione, non un dettaglio. -->
                        <span
                            v-if="voce.repeats > 1"
                            class="w-fit rounded-full bg-[var(--talos-active)] px-[var(--talos-space-inline)] text-3xs text-[var(--talos-muted)]"
                        >{{ t('notifications.repeats', { count: voce.repeats }) }}</span>
                    </li>
                </ul>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
