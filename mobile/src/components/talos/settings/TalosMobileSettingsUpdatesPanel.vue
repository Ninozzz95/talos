<script setup lang="ts">
/**
 * Impostazioni › Aggiornamenti (owner 22/10/2026, tavola 6 del mockup adattata a «semplice a primo sguardo»): a primo sguardo
 * solo la versione, «Controlla ora» e UN interruttore; «Solo con Wi-Fi», «Avvisami quando è pronta», il permesso e le note di
 * rilascio stanno sotto «Avanzate», che si apre a richiesta.
 */
import { computed, onMounted, ref } from 'vue'
import { ChevronRight, RefreshCw } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import { useTalosHeightDisclosure } from '@/composables/useTalosHeightDisclosure'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosFormatBytes } from '@/lib/models/presentation'
import {
    talosAggiornamenti,
    talosAvviaAggiornamenti,
    talosControllaOra,
    talosImpostaAggiornamenti,
    type TalosEsitoControlloOra,
} from '@/services/appUpdates'
import { talosApriCassettoAggiornamento } from '@/lib/updates/segnaleAggiornamento'

const { t } = useTalosI18n()
const vHeightDisclosure = useTalosHeightDisclosure()

const avanzate = ref(false)
const controllo = ref(false)
const esito = ref<TalosEsitoControlloOra | null>(null)

/** Senza dimensione nota, quella dell'ultima release pubblicata (0.1.43: 193 MB). */
const PESO_TIPICO = 193 * 1000 * 1000

onMounted(() => { void talosAvviaAggiornamenti() })

const labels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))

const pronta = computed(() => talosAggiornamenti.fase === 'PRONTA' && talosAggiornamenti.versione !== null)

const riga = computed(() => {
    const quando = talosAggiornamenti.ultimoControllo
    if (quando === null) return t('updates.neverChecked')
    const when = talosRelativeTime(new Date(quando).toISOString(), new Date(), labels.value)
    return pronta.value
        ? t('updates.lastCheckReady', { when, version: talosAggiornamenti.versione ?? '' })
        : t('updates.lastCheck', { when })
})

const esitoTesto = computed(() => {
    switch (esito.value) {
        // solo mentre scarica: finito, lo dice già la riga «la X è pronta» (visto sul Pad il 22/10, UPD-SET-05)
        case 'trovata': return talosAggiornamenti.fase === 'IN_SCARICAMENTO' ? t('updates.checkFound', { version: talosAggiornamenti.versione ?? '' }) : ''
        case 'aggiornata': return t('updates.checkUpToDate')
        case 'irraggiungibile': return t('updates.checkUnreachable')
        case 'rifiutata': return t('updates.checkRejected')
        default: return ''
    }
})

const peso = computed(() => talosFormatBytes(talosAggiornamenti.dimensione ?? PESO_TIPICO))

async function controllaOra(): Promise<void> {
    if (controllo.value) return
    controllo.value = true
    esito.value = null
    try {
        esito.value = await talosControllaOra()
    } finally {
        controllo.value = false
    }
}

const rigaInterruttore = 'flex min-h-14 cursor-pointer items-start justify-between gap-3 border-t border-[var(--talos-border)] py-3'
</script>

<template>
    <section data-testid="talos-settings-updates" class="space-y-4">
        <div class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-4">
            <p class="text-xs text-[var(--talos-muted)]">{{ t('updates.installedVersion') }}</p>
            <p data-testid="talos-updates-installed" class="mt-1 text-lg font-semibold tabular-nums text-[var(--talos-text)]">
                {{ talosAggiornamenti.installata || '—' }}
            </p>
            <p data-testid="talos-updates-last-check" class="mt-2 text-sm text-[var(--talos-muted)]">{{ riga }}</p>

            <!-- Un'azione primaria sola: con una versione pronta è installarla, altrimenti controllare. -->
            <button
                v-if="pronta"
                type="button"
                data-testid="talos-updates-install"
                class="talos-pressable mt-4 inline-flex min-h-touch w-full items-center justify-center rounded-full bg-[var(--talos-accent)] px-4 text-sm font-semibold text-[var(--talos-accent-contrast)]"
                @click="talosApriCassettoAggiornamento()"
            >{{ t('updates.installAndRestart', { version: talosAggiornamenti.versione ?? '' }) }}</button>
            <button
                v-else
                type="button"
                data-testid="talos-updates-check"
                class="talos-pressable mt-4 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-full border border-[var(--talos-border)] px-4 text-sm font-semibold text-[var(--talos-text)] disabled:opacity-60"
                :disabled="controllo"
                :aria-busy="controllo || undefined"
                @click="controllaOra"
            >
                <RefreshCw class="size-4 motion-safe:transition-transform" :class="controllo ? 'motion-safe:animate-spin' : ''" aria-hidden="true" />
                {{ controllo ? t('updates.checking') : t('updates.checkNow') }}
            </button>
            <p
                v-if="esitoTesto"
                data-testid="talos-updates-check-result"
                class="mt-2 text-sm text-[var(--talos-text)]"
                role="status"
            >{{ esitoTesto }}</p>
        </div>

        <div :class="rigaInterruttore" class="border-t-0">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('updates.automatic') }}</span>
                <span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('updates.automaticHint') }}</span>
            </span>
            <TalosThemedSwitch
                class="mt-1"
                test-id="talos-updates-automatic"
                :aria-label="t('updates.automatic')"
                :model-value="talosAggiornamenti.automatici"
                @update:model-value="talosImpostaAggiornamenti({ automatici: $event })"
            />
        </div>

        <button
            type="button"
            data-testid="talos-updates-advanced"
            class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left text-sm font-semibold text-[var(--talos-text)]"
            :class="avanzate ? 'rounded-b-none border-b-0' : ''"
            :aria-expanded="avanzate"
            aria-controls="talos-updates-advanced-body"
            @click="avanzate = !avanzate"
        >
            <ChevronRight
                class="size-3.5 shrink-0 text-[var(--talos-muted)] transition-transform motion-reduce:transition-none"
                :class="avanzate ? 'rotate-90' : ''"
                aria-hidden="true"
            />
            {{ t('updates.advanced') }}
        </button>
        <div
            id="talos-updates-advanced-body"
            v-height-disclosure="avanzate"
            data-testid="talos-updates-advanced-body"
            :aria-hidden="!avanzate || undefined"
            class="!mt-0 overflow-hidden rounded-xl rounded-t-none border border-t-0 border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3"
        >
            <div :class="rigaInterruttore" class="border-t-0">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('updates.wifiOnly') }}</span>
                    <span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('updates.wifiOnlyHint', { size: peso }) }}</span>
                </span>
                <TalosThemedSwitch
                    class="mt-1"
                    test-id="talos-updates-wifi"
                    :aria-label="t('updates.wifiOnly')"
                    :model-value="talosAggiornamenti.soloWifi"
                    :disabled="!talosAggiornamenti.automatici"
                    @update:model-value="talosImpostaAggiornamenti({ soloWifi: $event })"
                />
            </div>
            <div :class="rigaInterruttore">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('updates.notify') }}</span>
                    <span class="mt-1 block text-xs text-[var(--talos-muted)]">{{ t('updates.notifyHint') }}</span>
                </span>
                <TalosThemedSwitch
                    class="mt-1"
                    test-id="talos-updates-notify"
                    :aria-label="t('updates.notify')"
                    :model-value="talosAggiornamenti.avvisami"
                    @update:model-value="talosImpostaAggiornamenti({ avvisami: $event })"
                />
            </div>
            <div class="border-t border-[var(--talos-border)] py-3">
                <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ t('updates.permission') }}</span>
                <span data-testid="talos-updates-permission" class="mt-1 block text-xs text-[var(--talos-muted)]">
                    {{ talosAggiornamenti.permessoConcesso ? t('updates.permissionGranted') : t('updates.permissionMissing') }}
                </span>
            </div>
            <a
                v-if="talosAggiornamenti.pagina"
                data-testid="talos-updates-release-notes"
                :href="talosAggiornamenti.pagina"
                target="_blank"
                rel="noopener noreferrer"
                class="talos-pressable flex min-h-touch items-center border-t border-[var(--talos-border)] text-sm font-semibold text-[var(--talos-accent)]"
            >{{ t('updates.releaseNotes') }}</a>
        </div>
    </section>
</template>
